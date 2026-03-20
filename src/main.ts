import { Editor, Modal, Notice, Plugin, SuggestModal, TFile } from 'obsidian';
import type { PostpartumTrackerSettings, TrackerEvent, FeedingEntry, DiaperEntry, MedicationEntry, SimpleTrackerEntry, PostpartumData, MedicationConfig } from './types';
import { DEFAULT_SETTINGS, DEFAULT_MEDICATIONS, EMPTY_DATA } from './types';
import { CodeBlockStore } from './data/CodeBlockStore';
import { TrackerRegistry } from './data/TrackerRegistry';
import { TrackerWidget } from './widget/TrackerWidget';
import { PostpartumTrackerSettingsTab } from './settings';
import { deepMerge } from './utils/deepMerge';
import { FeedingTracker } from './trackers/feeding/FeedingTracker';
import { DiaperTracker } from './trackers/diaper/DiaperTracker';
import { MedicationTracker } from './trackers/medication/MedicationTracker';
import { SimpleTrackerModule } from './trackers/simple/SimpleTrackerModule';
import { CommentTracker } from './trackers/comment/CommentTracker';
import { TRACKER_LIBRARY } from './trackers/library';
import { NotificationService } from './notifications/NotificationService';
import { TodoistService } from './integrations/TodoistService';
import { StatusBarManager } from './StatusBarManager';
import { generateId } from './utils/formatters';

export default class PostpartumTrackerPlugin extends Plugin {
	settings: PostpartumTrackerSettings = DEFAULT_SETTINGS;
	registry: TrackerRegistry = new TrackerRegistry();
	notificationService!: NotificationService;
	todoistService!: TodoistService;
	statusBarManager!: StatusBarManager;
	store!: CodeBlockStore;
	private rebuildTimer: ReturnType<typeof setTimeout> | null = null;

	/** Active TrackerWidget instances — used to refresh UI when settings change. */
	private activeWidgets = new Set<TrackerWidget>();

	registerWidget(w: TrackerWidget): void { this.activeWidgets.add(w); }
	unregisterWidget(w: TrackerWidget): void { this.activeWidgets.delete(w); }

	/** Refresh all active tracker widgets (re-reads settings and rebuilds UI). */
	refreshAllWidgets(): void {
		for (const w of this.activeWidgets) {
			w.refresh();
		}
	}

	// ── Simple Event Bus ──
	private eventListeners: Map<string, Array<(event: TrackerEvent & { module?: string }) => void>> = new Map();

	/** Emit a tracker event to all registered listeners. */
	emitTrackerEvent(event: TrackerEvent & { module?: string }): void {
		const listeners = this.eventListeners.get(event.type) || [];
		for (const listener of listeners) {
			try { listener(event); } catch (e) { console.warn('Event listener error:', e); }
		}
	}

	/** Register a listener for tracker events. */
	onTrackerEvent(type: string, listener: (event: TrackerEvent & { module?: string }) => void): void {
		if (!this.eventListeners.has(type)) {
			this.eventListeners.set(type, []);
		}
		this.eventListeners.get(type)!.push(listener);
	}

	/** Last 8 chars of deviceId for file naming. */
	get deviceShortId(): string {
		return this.settings.deviceId.slice(-8);
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new CodeBlockStore(this.app, this.deviceShortId);

		// Register core tracker modules
		this.registry.register(new FeedingTracker());
		this.registry.register(new DiaperTracker());
		this.registry.register(new MedicationTracker());
		this.registry.register(new CommentTracker());

		// Register simple (library) tracker modules for enabled IDs
		for (const def of TRACKER_LIBRARY) {
			if (this.settings.enabledModules.includes(def.id)) {
				const override = this.settings.libraryTrackerOverrides[def.id];
				this.registry.register(new SimpleTrackerModule(def, override));
			}
		}

		// Register user-created custom trackers
		for (const def of this.settings.customTrackers) {
			if (this.settings.enabledModules.includes(def.id)) {
				this.registry.register(new SimpleTrackerModule(def));
			}
		}

		// Register the code block processor
		this.registerMarkdownCodeBlockProcessor(
			'postpartum-tracker',
			async (source, el, ctx) => {
				const data = await this.store.load(source, ctx.sourcePath);
				const widget = new TrackerWidget(el, this, data, ctx);
				ctx.addChild(widget);
			}
		);

		// Command: insert a new postpartum tracker code block
		this.addCommand({
			id: 'insert-postpartum-tracker',
			name: 'Insert postpartum tracker',
			editorCallback: (editor: Editor) => {
				const emptyData = JSON.stringify(EMPTY_DATA);
				editor.replaceSelection(
					`\`\`\`postpartum-tracker\n${emptyData}\n\`\`\`\n`
				);
			},
		});

		// Command: restore data from a backup
		this.addCommand({
			id: 'restore-from-backup',
			name: 'Restore tracker data from backup',
			callback: () => this.restoreFromBackup(),
		});

		// Command: force migrate to multi-device
		this.addCommand({
			id: 'migrate-multi-device',
			name: 'Migrate tracker to per-device sync',
			callback: () => this.migrateToMultiDevice(),
		});

		// Auto-migrate on startup (after vault is ready)
		this.app.workspace.onLayoutReady(() => {
			setTimeout(() => this.migrateToMultiDevice(true), 2000);
		});

		// Add ribbon icon
		this.addRibbonIcon('baby', 'Insert postpartum tracker', () => {
			const activeEditor = this.app.workspace.activeEditor;
			if (activeEditor?.editor) {
				const emptyData = JSON.stringify(EMPTY_DATA);
				activeEditor.editor.replaceSelection(
					`\`\`\`postpartum-tracker\n${emptyData}\n\`\`\`\n`
				);
			}
		});

		// Command: test Todoist connection (writes to todoist-debug.log)
		this.addCommand({
			id: 'test-todoist-connection',
			name: 'Test Todoist connection',
			callback: async () => {
				const todoist = this.settings.todoist;
				if (!todoist.apiToken) {
					new Notice('No Todoist API token configured');
					return;
				}
				new Notice('Testing Todoist connection... check todoist-debug.log');
				const ok = await this.todoistService.testConnection();
				if (ok) {
					new Notice('Todoist connection successful!');
				} else {
					new Notice('Todoist connection FAILED — see todoist-debug.log for details');
				}
			},
		});

		// ── Developer / debug commands (visible when enableDebugLog is on) ──

		this.addCommand({
			id: 'debug-fetch-workspaces',
			name: '[Dev] Fetch Todoist workspaces',
			checkCallback: (checking) => {
				if (!this.settings.enableDebugLog) return false;
				if (checking) return true;
				(async () => {
					new Notice('Fetching workspaces... check todoist-debug.log');
					const ws = await this.todoistService.fetchWorkspaces();
					new Notice(ws.length ? `Found ${ws.length} workspace(s): ${ws.map(w => w.name).join(', ')}` : 'No workspaces found.');
				})();
			},
		});

		this.addCommand({
			id: 'debug-list-projects',
			name: '[Dev] List Todoist projects',
			checkCallback: (checking) => {
				if (!this.settings.enableDebugLog) return false;
				if (checking) return true;
				(async () => {
					new Notice('Fetching projects... check todoist-debug.log');
					const projects = await this.todoistService.debugListProjects();
					if (!projects) { new Notice('Failed to fetch projects'); return; }
					new Notice(`Found ${projects.length} project(s): ${projects.map((p: {name: string}) => p.name).join(', ')}`);
				})();
			},
		});

		this.addCommand({
			id: 'debug-notification-check',
			name: '[Dev] Force notification check',
			checkCallback: (checking) => {
				if (!this.settings.enableDebugLog) return false;
				if (checking) return true;
				(async () => {
					new Notice('Running notification check...');
					await this.notificationService.check();
					const active = this.notificationService.getActive();
					new Notice(`Check complete. ${active.length} active alert(s).`);
				})();
			},
		});

		this.addCommand({
			id: 'debug-rebuild-registry',
			name: '[Dev] Rebuild tracker registry',
			checkCallback: (checking) => {
				if (!this.settings.enableDebugLog) return false;
				if (checking) return true;
				(async () => {
					new Notice('Rebuilding registry...');
					await this.rebuildRegistry();
					const ids = this.registry.getIds();
					new Notice(`Registry rebuilt: ${ids.length} modules (${ids.join(', ')})`);
				})();
			},
		});

		this.addCommand({
			id: 'debug-dump-settings',
			name: '[Dev] Dump settings to console',
			checkCallback: (checking) => {
				if (!this.settings.enableDebugLog) return false;
				if (checking) return true;
				console.log('Postpartum Tracker settings:', JSON.parse(JSON.stringify(this.settings)));
				new Notice('Settings dumped to developer console (Ctrl+Shift+I)');
			},
		});

		this.addCommand({
			id: 'debug-clear-todoist-log',
			name: '[Dev] Clear Todoist debug log',
			checkCallback: (checking) => {
				if (!this.settings.enableDebugLog) return false;
				if (checking) return true;
				(async () => {
					const file = this.app.vault.getAbstractFileByPath('todoist-debug.log');
					if (file) {
						await this.app.vault.modify(file as TFile, '# Todoist Debug Log\nCleared: ' + new Date().toISOString() + '\n\n');
					}
					new Notice('Debug log cleared');
				})();
			},
		});

		// ── Quick-action commands ──
		this.registerTrackerCommands();

		// ── URI handler for external automation (iOS Shortcuts / Tasker) ──
		this.registerObsidianProtocolHandler('postpartum-tracker', (params) => {
			this.handleUri(params);
		});

		// Status bar item for notifications
		const statusBarEl = this.addStatusBarItem();
		statusBarEl.addClass('pt-status-bar');

		// Notification service
		this.notificationService = new NotificationService(this);
		this.notificationService.setStatusBarEl(statusBarEl);
		this.notificationService.start();

		// Status bar live info
		this.statusBarManager = new StatusBarManager(statusBarEl, this);
		this.statusBarManager.start();

		// Todoist integration
		this.todoistService = new TodoistService(this);

		// Wire tracker events → Todoist + scheduled ntfy reminders
		this.onTrackerEvent('feeding-logged', (e) => {
			this.todoistService.onTrackerEvent(e);
			this.notificationService.scheduleFollowUpFromEvent(e);
		});
		this.onTrackerEvent('medication-logged', (e) => {
			this.todoistService.onTrackerEvent(e);
			this.notificationService.scheduleFollowUpFromEvent(e);
		});
		this.onTrackerEvent('diaper-logged', (e) => this.todoistService.onTrackerEvent(e));
		this.onTrackerEvent('simple-logged', (e) => {
			this.todoistService.onTrackerEvent(e);
			this.notificationService.scheduleFollowUpFromEvent(e);
		});

		// Wire Todoist → tracker (two-way sync: entries created from Todoist completions)
		this.onTrackerEvent('todoist-entry-created', (e) => this.writeEntryToVault(e));

		// Status bar click: show active notifications as toast
		statusBarEl.addEventListener('click', () => {
			const active = this.notificationService.getActive();
			if (active.length === 0) {
				new Notice('No active alerts');
			}
			// Toasts are already shown by the service; clicking just focuses attention
		});

		// Request system notification permission if configured
		if (this.settings.notifications.type === 'system' || this.settings.notifications.type === 'both') {
			if ('Notification' in window && Notification.permission === 'default') {
				Notification.requestPermission();
			}
		}

		// Settings tab
		this.addSettingTab(new PostpartumTrackerSettingsTab(this.app, this));
	}

	/**
	 * Write a Todoist-created entry directly to the tracker data in the vault.
	 * Scans for the postpartum-tracker code block, parses JSON, adds entry, writes back.
	 */
	private async writeEntryToVault(event: TrackerEvent & { module?: string }): Promise<void> {
		const moduleId = event.module;
		if (!moduleId) return;

		try {
			const result = await this.findAndParseTrackerBlock();
			if (!result) return;

			const { data, file } = result;
			const entries = data.trackers[moduleId];
			if (!Array.isArray(entries)) return;

			entries.push(event.entry as never);

			// Sort by timestamp/start
			entries.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
				const aTime = (a.start || a.timestamp) as string;
				const bTime = (b.start || b.timestamp) as string;
				return new Date(aTime).getTime() - new Date(bTime).getTime();
			});

			// Write back using the same external file mechanism
			await this.writeTrackerBlock(file, result.content, data);
		} catch (e) {
			console.warn('Postpartum Tracker: failed to write Todoist entry to vault', e);
		}
	}

	/**
	 * Handle URI calls: obsidian://postpartum-tracker?action=log-diaper&type=wet
	 * Supported actions: log-feeding-left, log-feeding-right, log-feeding-bottle,
	 * log-diaper-wet, log-diaper-dirty, log-diaper-both, toggle-sleep, etc.
	 */
	private handleUri(params: Record<string, string>): void {
		const action = params.action;
		if (!action) {
			new Notice('Postpartum Tracker: no action specified in URI');
			return;
		}

		// Map URI actions to command IDs
		const commandId = `postpartum-tracker:${action}`;
		const command = (this.app as any).commands?.commands?.[commandId];
		if (command) {
			(this.app as any).commands.executeCommandById(commandId);
			new Notice(`Postpartum Tracker: ${action}`);
		} else {
			new Notice(`Postpartum Tracker: unknown action "${action}"`);
		}
	}

	/** Register all quick-action commands for the tracker. */
	private registerTrackerCommands(): void {
		// ── Feeding ──
		this.addCommand({
			id: 'log-feeding-left',
			name: 'Log feeding: left side',
			callback: () => this.quickLogFeeding('left'),
		});
		this.addCommand({
			id: 'log-feeding-right',
			name: 'Log feeding: right side',
			callback: () => this.quickLogFeeding('right'),
		});
		this.addCommand({
			id: 'log-feeding-both',
			name: 'Log feeding: both sides',
			callback: () => this.quickLogFeeding('both'),
		});
		this.addCommand({
			id: 'stop-active-feeding',
			name: 'Stop active feeding timer',
			callback: () => this.stopActiveFeeding(),
		});

		// ── Diaper ──
		this.addCommand({
			id: 'log-diaper-wet',
			name: 'Log diaper: wet',
			callback: () => this.quickLogDiaper(true, false),
		});
		this.addCommand({
			id: 'log-diaper-dirty',
			name: 'Log diaper: dirty',
			callback: () => this.quickLogDiaper(false, true),
		});
		this.addCommand({
			id: 'log-diaper-both',
			name: 'Log diaper: wet + dirty',
			callback: () => this.quickLogDiaper(true, true),
		});

		// ── Medication ──
		this.addCommand({
			id: 'log-medication',
			name: 'Log medication dose',
			callback: () => this.showMedicationPicker(),
		});

		// ── Generic: log any enabled simple tracker ──
		this.addCommand({
			id: 'log-tracker-entry',
			name: 'Log tracker entry (pick module)',
			callback: () => this.showTrackerPicker(),
		});

		// ── Duration toggle commands ──
		const durationModules = [
			{ id: 'sleep', name: 'Sleep' },
			{ id: 'pumping', name: 'Pumping' },
			{ id: 'walking', name: 'Walking' },
			{ id: 'tummy-time', name: 'Tummy time' },
			{ id: 'skin-to-skin', name: 'Skin-to-skin' },
		];

		for (const mod of durationModules) {
			this.addCommand({
				id: `toggle-${mod.id}`,
				name: `Toggle ${mod.name.toLowerCase()} timer`,
				checkCallback: (checking) => {
					if (!this.settings.enabledModules.includes(mod.id)) return false;
					if (checking) return true;
					this.toggleDurationTracker(mod.id, mod.name);
				},
			});
			this.addCommand({
				id: `stop-${mod.id}`,
				name: `Stop ${mod.name.toLowerCase()} timer`,
				checkCallback: (checking) => {
					if (!this.settings.enabledModules.includes(mod.id)) return false;
					if (checking) return true;
					this.stopDurationTracker(mod.id, mod.name);
				},
			});
		}

		// ── Quick check-in commands ──
		this.addCommand({
			id: 'log-mood',
			name: 'Log mood (1-5)',
			checkCallback: (checking) => {
				if (!this.settings.enabledModules.includes('mood')) return false;
				if (checking) return true;
				this.quickLogRating('mood', 'Mood', 1, 5, 'value');
			},
		});
		this.addCommand({
			id: 'log-pain',
			name: 'Log pain level (1-10)',
			checkCallback: (checking) => {
				if (!this.settings.enabledModules.includes('pain')) return false;
				if (checking) return true;
				this.quickLogRating('pain', 'Pain', 1, 10, 'level');
			},
		});
		this.addCommand({
			id: 'log-weight',
			name: 'Log weight',
			checkCallback: (checking) => {
				if (!this.settings.enabledModules.includes('weight')) return false;
				if (checking) return true;
				this.quickLogNumeric('weight', 'Weight', 'g', 'value');
			},
		});
		this.addCommand({
			id: 'log-temperature',
			name: 'Log temperature',
			checkCallback: (checking) => {
				if (!this.settings.enabledModules.includes('temperature')) return false;
				if (checking) return true;
				this.quickLogNumeric('temperature', 'Temperature', '\u00B0F', 'value');
			},
		});

		// ── Utility commands ──
		this.addCommand({
			id: 'navigate-to-tracker',
			name: 'Navigate to tracker',
			callback: () => this.navigateToTracker(),
		});
		this.addCommand({
			id: 'undo-last-entry',
			name: 'Undo last entry',
			callback: () => this.undoLastEntry(),
		});
		this.addCommand({
			id: 'show-daily-summary',
			name: 'Show daily summary',
			callback: () => this.showDailySummary(),
		});

		// ── Export ──
		// ── History ──
		this.addCommand({
			id: 'show-history',
			name: 'Show tracker history',
			callback: async () => {
				const { HistoryModal } = await import('./ui/HistoryModal');
				new HistoryModal(this.app, this).open();
			},
		});

		// ── Export ──
		this.addCommand({
			id: 'export-markdown',
			name: 'Export data as markdown',
			callback: async () => {
				const { ExportService } = await import('./data/ExportService');
				const exporter = new ExportService(this);
				const md = exporter.exportMarkdown();
				const path = `postpartum-export-${new Date().toISOString().split('T')[0]}.md`;
				await this.app.vault.create(path, md);
				new Notice(`Exported to ${path}`);
			},
		});

		this.addCommand({
			id: 'export-csv',
			name: 'Export data as CSV',
			callback: async () => {
				const { ExportService } = await import('./data/ExportService');
				const exporter = new ExportService(this);
				const csv = exporter.exportCsv();
				const path = `postpartum-export-${new Date().toISOString().split('T')[0]}.csv`;
				await this.app.vault.create(path, csv);
				new Notice(`Exported to ${path}`);
			},
		});
	}

	/** Start a feeding entry (or stop current and switch side). */
	private async quickLogFeeding(side: 'left' | 'right' | 'both'): Promise<void> {
		const result = await this.findAndParseTrackerBlock();
		if (!result) { new Notice('No postpartum tracker found'); return; }

		const { data, file, content } = result;
		const entries: FeedingEntry[] = Array.isArray(data.trackers.feeding) ? data.trackers.feeding : [];

		// Stop any active feeding
		const active = entries.find(e => e.end === null);
		if (active) {
			active.end = new Date().toISOString();
			active.durationSec = Math.round(
				(new Date(active.end).getTime() - new Date(active.start).getTime()) / 1000
			);
		}

		// Start new
		const entry: FeedingEntry = {
			id: generateId(),
			type: 'breast',
			side,
			start: new Date().toISOString(),
			end: null,
			notes: '',
		};
		entries.push(entry);
		data.trackers.feeding = entries;

		await this.writeTrackerBlock(file, content, data);
		new Notice(`Feeding started (${side})`);
	}

	/** Stop active feeding timer. */
	private async stopActiveFeeding(): Promise<void> {
		const result = await this.findAndParseTrackerBlock();
		if (!result) { new Notice('No postpartum tracker found'); return; }

		const { data, file, content } = result;
		const entries: FeedingEntry[] = Array.isArray(data.trackers.feeding) ? data.trackers.feeding : [];
		const active = entries.find(e => e.end === null);
		if (!active) { new Notice('No active feeding'); return; }

		active.end = new Date().toISOString();
		active.durationSec = Math.round(
			(new Date(active.end).getTime() - new Date(active.start).getTime()) / 1000
		);
		data.trackers.feeding = entries;

		await this.writeTrackerBlock(file, content, data);
		new Notice(`Feeding stopped (${Math.round(active.durationSec / 60)}m)`);
	}

	/** Instantly log a diaper change. */
	private async quickLogDiaper(wet: boolean, dirty: boolean): Promise<void> {
		const result = await this.findAndParseTrackerBlock();
		if (!result) { new Notice('No postpartum tracker found'); return; }

		const { data, file, content } = result;
		const entries: DiaperEntry[] = Array.isArray(data.trackers.diaper) ? data.trackers.diaper : [];

		const entry: DiaperEntry = {
			id: generateId(),
			timestamp: new Date().toISOString(),
			wet,
			dirty,
			description: '',
			notes: '',
		};
		entries.push(entry);
		data.trackers.diaper = entries;

		await this.writeTrackerBlock(file, content, data);
		const type = wet && dirty ? 'wet + dirty' : wet ? 'wet' : 'dirty';
		new Notice(`Diaper logged (${type})`);
	}

	/** Show a suggest modal for picking a medication and logging a dose. */
	private showMedicationPicker(): void {
		const meds = this.settings.medication.medications.filter(m => m.enabled);
		if (meds.length === 0) { new Notice('No medications enabled'); return; }

		const modal = new MedicationPickerModal(this.app, meds, async (med) => {
			const result = await this.findAndParseTrackerBlock();
			if (!result) { new Notice('No postpartum tracker found'); return; }

			const { data, file, content } = result;
			const entries: MedicationEntry[] = Array.isArray(data.trackers.medication) ? data.trackers.medication : [];

			const entry: MedicationEntry = {
				id: generateId(),
				name: med.name,
				dosage: med.dosage,
				timestamp: new Date().toISOString(),
				notes: '',
			};
			entries.push(entry);
			data.trackers.medication = entries;

			await this.writeTrackerBlock(file, content, data);
			new Notice(`${med.icon} ${med.name} logged`);
		});
		modal.open();
	}

	/** Show a suggest modal for picking any enabled tracker module and logging a quick entry. */
	private showTrackerPicker(): void {
		const enabledIds = this.settings.enabledModules;
		const modules: { id: string; name: string }[] = [];
		for (const mod of this.registry.getAll()) {
			if (enabledIds.includes(mod.id)) {
				modules.push({ id: mod.id, name: mod.displayName });
			}
		}
		if (modules.length === 0) { new Notice('No modules enabled'); return; }

		const modal = new TrackerPickerModal(this.app, modules, async (choice) => {
			const result = await this.findAndParseTrackerBlock();
			if (!result) { new Notice('No postpartum tracker found'); return; }

			const { data, file, content } = result;
			const entries: SimpleTrackerEntry[] = Array.isArray(data.trackers[choice.id]) ? data.trackers[choice.id] as SimpleTrackerEntry[] : [];

			const entry: SimpleTrackerEntry = {
				id: generateId(),
				timestamp: new Date().toISOString(),
				fields: {},
				notes: '',
			};
			entries.push(entry);
			data.trackers[choice.id] = entries;

			await this.writeTrackerBlock(file, content, data);
			new Notice(`${choice.name} logged`);
		});
		modal.open();
	}

	/** Find the first file with a postpartum-tracker code block and parse it. */
	/** Migrate all tracker blocks to per-device multi-device format. */
	async migrateToMultiDevice(silent = false): Promise<void> {
		let migrated = 0;
		for (const file of this.app.vault.getMarkdownFiles()) {
			const content = await this.app.vault.cachedRead(file);
			const match = content.match(/```postpartum-tracker\n([\s\S]*?)\n```/);
			if (!match?.[1]) continue;

			try {
				const ref = JSON.parse(match[1].trim());

				// Already multi-device
				if (ref.multiDevice) continue;

				// Has a single-file dataFile ref — migrate it
				if (ref.dataFile) {
					const dir = file.path.substring(0, file.path.lastIndexOf('/'));
					const prefix = dir ? `${dir}/` : '';
					const baseName = ref.dataFile.replace(/\.json$/, '');
					const legacyPath = `${prefix}${ref.dataFile}`;
					const devicePath = `${prefix}${baseName}.${this.deviceShortId}.json`;

					// Copy legacy to device file if it exists
					const legacyExists = await this.app.vault.adapter.exists(legacyPath);
					const deviceExists = await this.app.vault.adapter.exists(devicePath);
					if (legacyExists && !deviceExists) {
						const data = await this.app.vault.adapter.read(legacyPath);
						await this.app.vault.adapter.write(devicePath, data);
					}

					// Update code block ref
					const newRef = JSON.stringify({ dataFile: baseName, multiDevice: true });
					const newContent = content.replace(
						/```postpartum-tracker\n[\s\S]*?\n```/,
						`\`\`\`postpartum-tracker\n${newRef}\n\`\`\``
					);
					await this.app.vault.modify(file, newContent);
					migrated++;
					continue;
				}

				// Inline data (no dataFile) — migrate to external + multi-device
				const data = await this.store.load(match[1].trim(), file.path);
				const entryCount = Object.values(data.trackers).reduce(
					(sum: number, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0 as number);
				if (entryCount === 0 && !data.meta.babyName) continue;

				const baseName = file.name.replace(/\.md$/, '.tracker');
				const dir = file.path.substring(0, file.path.lastIndexOf('/'));
				const prefix = dir ? `${dir}/` : '';
				const devicePath = `${prefix}${baseName}.${this.deviceShortId}.json`;

				await this.app.vault.adapter.write(devicePath, this.store.serializeForExternal(data));
				const newRef = JSON.stringify({ dataFile: baseName, multiDevice: true });
				const newContent = content.replace(
					/```postpartum-tracker\n[\s\S]*?\n```/,
					`\`\`\`postpartum-tracker\n${newRef}\n\`\`\``
				);
				await this.app.vault.modify(file, newContent);
				migrated++;
			} catch (e) {
				if (!silent) console.warn(`Migration failed for ${file.path}`, e);
			}
		}

		if (!silent && migrated > 0) {
			new Notice(`Migrated ${migrated} tracker${migrated > 1 ? 's' : ''} to per-device sync.`);
		} else if (!silent && migrated === 0) {
			new Notice('All trackers already using per-device sync.');
		}
	}

	/** Create a manual backup of all external tracker data files. */
	async createManualBackup(): Promise<void> {
		let count = 0;
		for (const file of this.app.vault.getMarkdownFiles()) {
			const content = await this.app.vault.cachedRead(file);
			const match = content.match(/```postpartum-tracker\n([\s\S]*?)\n```/);
			if (!match?.[1]) continue;

			try {
				const ref = JSON.parse(match[1]);
				if (!ref.dataFile) continue;

				const dir = file.path.substring(0, file.path.lastIndexOf('/'));
				const dataPath = dir ? `${dir}/${ref.dataFile}` : ref.dataFile;
				const backupDir = dataPath.replace('.tracker.json', '.tracker-backups');
				const ts = new Date().toISOString().replace(/[:.]/g, '-');
				const backupPath = `${backupDir}/${ts}.json`;

				const exists = await this.app.vault.adapter.exists(dataPath);
				if (!exists) continue;

				const data = await this.app.vault.adapter.read(dataPath);
				const dirExists = await this.app.vault.adapter.exists(backupDir);
				if (!dirExists) await this.app.vault.adapter.mkdir(backupDir);
				await this.app.vault.adapter.write(backupPath, data);
				count++;
			} catch { /* skip */ }
		}

		new Notice(count > 0 ? `Created backup for ${count} tracker${count > 1 ? 's' : ''}.` : 'No external trackers found to backup.');
	}

	/**
	 * Migrate all tracker code blocks to a new storage mode.
	 * Called when the user changes the storage mode setting.
	 */
	async migrateAllTrackers(targetMode: 'inline' | 'external'): Promise<void> {
		let migrated = 0;
		let skipped = 0;

		for (const file of this.app.vault.getMarkdownFiles()) {
			const content = await this.app.vault.cachedRead(file);
			const match = content.match(/```postpartum-tracker\n([\s\S]*?)\n```/);
			if (!match?.[1]) continue;

			const blockContent = match[1].trim();
			let isExternal = false;
			try {
				const ref = JSON.parse(blockContent);
				isExternal = !!ref.dataFile;
			} catch { /* inline or corrupted */ }

			if (targetMode === 'external' && !isExternal) {
				// Inline → External: read data from code block, write to file, replace with ref
				try {
					const data = await this.store.load(blockContent, file.path);
					// Safety: don't migrate empty/default data
					const entryCount = Object.values(data.trackers).reduce(
						(sum: number, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0 as number);
					if (entryCount === 0 && !data.meta.babyName) {
						skipped++;
						continue;
					}

					const dataFileName = file.name.replace(/\.md$/, '.tracker.json');
					const dir = file.path.substring(0, file.path.lastIndexOf('/'));
					const dataPath = dir ? `${dir}/${dataFileName}` : dataFileName;

					// Write external file FIRST
					const serialized = this.store.serializeForExternal(data);
					await this.app.vault.adapter.write(dataPath, serialized);

					// Verify the file was actually written before updating the code block
					const exists = await this.app.vault.adapter.exists(dataPath);
					if (!exists) {
						console.error(`Migration: data file not created at ${dataPath}`);
						skipped++;
						continue;
					}

					// Only NOW replace the code block with the ref
					const ref = JSON.stringify({ dataFile: dataFileName, ts: Date.now() });
					const newContent = content.replace(
						/```postpartum-tracker\n[\s\S]*?\n```/,
						`\`\`\`postpartum-tracker\n${ref}\n\`\`\``
					);
					await this.app.vault.modify(file, newContent);
					migrated++;
				} catch (e) {
					console.warn(`Migration failed for ${file.path}`, e);
					new Notice(`Migration failed for ${file.name}: ${e}`);
					skipped++;
				}
			} else if (targetMode === 'inline' && isExternal) {
				// External → Inline: read from external file, write inline, optionally remove external file
				try {
					const data = await this.store.load(blockContent, file.path);
					const json = JSON.stringify(data);
					const newContent = content.replace(
						/```postpartum-tracker\n[\s\S]*?\n```/,
						`\`\`\`postpartum-tracker\n${json}\n\`\`\``
					);
					await this.app.vault.modify(file, newContent);
					migrated++;
				} catch (e) {
					console.warn(`Migration failed for ${file.path}`, e);
					skipped++;
				}
			} else {
				skipped++; // Already in target format
			}
		}

		const msg = migrated > 0
			? `Migrated ${migrated} tracker${migrated > 1 ? 's' : ''} to ${targetMode} storage.`
			: 'All trackers already in the target format.';
		if (skipped > 0 && migrated > 0) {
			new Notice(`${msg} ${skipped} already migrated.`);
		} else {
			new Notice(msg);
		}

		// Create an immediate backup after migration
		if (migrated > 0 && targetMode === 'external') {
			await this.createManualBackup();
		}
	}

	/** Let user pick a backup and restore it as the active data. */
	async restoreFromBackup(): Promise<void> {
		// Find tracker files to locate backup directories
		const files = this.app.vault.getMarkdownFiles();
		const backupFiles: string[] = [];

		for (const file of files) {
			const content = await this.app.vault.cachedRead(file);
			const match = content.match(/```postpartum-tracker\n([\s\S]*?)\n```/);
			if (!match?.[1]) continue;

			try {
				const ref = JSON.parse(match[1]);
				if (ref.dataFile) {
					const dir = file.path.substring(0, file.path.lastIndexOf('/'));
					const backupDir = (dir ? `${dir}/` : '') + ref.dataFile.replace('.tracker.json', '.tracker-backups');
					try {
						const listing = await this.app.vault.adapter.list(backupDir);
						backupFiles.push(...listing.files.filter(f => f.endsWith('.json')).sort().reverse());
					} catch { /* no backups yet */ }
				}
			} catch { /* inline data, no backups */ }
		}

		if (backupFiles.length === 0) {
			new Notice('No backups found yet. Tap "Backup now" in settings, or backups are created automatically after the first save.', 8000);
			return;
		}

		// Preload summaries for each backup
		const backupItems: BackupItem[] = [];
		for (const path of backupFiles) {
			try {
				const raw = await this.app.vault.adapter.read(path);
				const data = JSON.parse(raw);
				const trackers = data.trackers || {};
				const counts: Record<string, number> = {};
				let latestEntry = '';
				for (const [k, v] of Object.entries(trackers)) {
					if (!Array.isArray(v) || v.length === 0) continue;
					counts[k] = v.length;
					for (const e of v as Record<string, unknown>[]) {
						const ts = (e.start || e.timestamp || '') as string;
						if (ts > latestEntry) latestEntry = ts;
					}
				}
				backupItems.push({ path, counts, latestEntry });
			} catch {
				backupItems.push({ path, counts: {}, latestEntry: '' });
			}
		}

		// Show picker
		const modal = new BackupPickerModal(this.app, backupItems, async (chosen) => {
			try {
				const content = await this.app.vault.adapter.read(chosen.path);
				JSON.parse(content); // validate

				// Find the active tracker's data file and overwrite it
				for (const file of this.app.vault.getMarkdownFiles()) {
					const md = await this.app.vault.cachedRead(file);
					const match = md.match(/```postpartum-tracker\n([\s\S]*?)\n```/);
					if (!match?.[1]) continue;
					try {
						const ref = JSON.parse(match[1]);
						if (ref.dataFile) {
							const dir = file.path.substring(0, file.path.lastIndexOf('/'));
							const dataPath = (dir ? `${dir}/` : '') + ref.dataFile;
							await this.app.vault.adapter.write(dataPath, content);
							// Bump timestamp to trigger re-render
							const newRef = JSON.stringify({ dataFile: ref.dataFile, ts: Date.now() });
							const newMd = md.replace(
								/```postpartum-tracker\n[\s\S]*?\n```/,
								`\`\`\`postpartum-tracker\n${newRef}\n\`\`\``
							);
							await this.app.vault.modify(file, newMd);
							new Notice('Backup restored successfully! Reopen the note to see changes.');
							return;
						}
					} catch { continue; }
				}
				new Notice('Could not find tracker to restore to.');
			} catch (e) {
				new Notice(`Restore failed: ${e}`);
			}
		});
		modal.open();
	}

	private async findAndParseTrackerBlock(): Promise<{ data: PostpartumData; file: TFile; content: string } | null> {
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const content = await this.app.vault.cachedRead(file);
			const match = content.match(/```postpartum-tracker\n([\s\S]*?)\n```/);
			if (match?.[1]) {
				const data = await this.store.load(match[1], file.path);
				return { data, file, content };
			}
		}
		return null;
	}

	/** Write updated data back to the tracker. Uses per-device file in multi-device mode. */
	private async writeTrackerBlock(file: TFile, originalContent: string, data: PostpartumData): Promise<void> {
		const match = originalContent.match(/```postpartum-tracker\n([\s\S]*?)\n```/);
		if (match?.[1]) {
			try {
				const ref = JSON.parse(match[1]);
				if (ref.dataFile) {
					const dir = file.path.substring(0, file.path.lastIndexOf('/'));
					const prefix = dir ? `${dir}/` : '';

					// Multi-device mode: write to THIS device's file
					const baseName = ref.multiDevice
						? ref.dataFile
						: ref.dataFile.replace(/\.json$/, '');
					const deviceFile = `${baseName}.${this.deviceShortId}.json`;
					const devicePath = `${prefix}${deviceFile}`;

					// Stamp with device metadata
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const fileData: any = {
						...data,
						_deviceId: this.deviceShortId,
						_metaModified: Date.now(),
						_layoutModified: Date.now(),
						_configModified: Date.now(),
					};

					await this.app.vault.adapter.write(devicePath, this.store.serializeForExternal(fileData));

					// Update ref to multi-device format if needed
					if (!ref.multiDevice) {
						const newRef = JSON.stringify({ dataFile: baseName, multiDevice: true });
						const newContent = originalContent.replace(
							/```postpartum-tracker\n[\s\S]*?\n```/,
							`\`\`\`postpartum-tracker\n${newRef}\n\`\`\``
						);
						await this.app.vault.modify(file, newContent);
					}
					return;
				}
			} catch { /* not a ref, fall through to inline */ }
		}

		// Inline mode (legacy or fallback)
		const json = JSON.stringify(data);
		const newContent = originalContent.replace(
			/```postpartum-tracker\n[\s\S]*?\n```/,
			`\`\`\`postpartum-tracker\n${json}\n\`\`\``
		);
		await this.app.vault.modify(file, newContent);
	}

	/** Toggle a duration tracker: start if stopped, stop if running. */
	private async toggleDurationTracker(moduleId: string, displayName: string): Promise<void> {
		const result = await this.findAndParseTrackerBlock();
		if (!result) { new Notice('No postpartum tracker found'); return; }

		const { data, file, content } = result;
		const entries: SimpleTrackerEntry[] = Array.isArray(data.trackers[moduleId]) ? data.trackers[moduleId] as SimpleTrackerEntry[] : [];
		const active = entries.find(e => e.end === null);

		if (active) {
			active.end = new Date().toISOString();
			active.durationSec = Math.round(
				(new Date(active.end).getTime() - new Date(active.timestamp).getTime()) / 1000
			);
			data.trackers[moduleId] = entries;
			await this.writeTrackerBlock(file, content, data);
			new Notice(`${displayName} stopped (${Math.round(active.durationSec / 60)}m)`);
		} else {
			const entry: SimpleTrackerEntry = {
				id: generateId(),
				timestamp: new Date().toISOString(),
				end: null,
				fields: {},
				notes: '',
			};
			entries.push(entry);
			data.trackers[moduleId] = entries;
			await this.writeTrackerBlock(file, content, data);
			new Notice(`${displayName} started`);
		}
	}

	/** Stop a duration tracker if running. */
	private async stopDurationTracker(moduleId: string, displayName: string): Promise<void> {
		const result = await this.findAndParseTrackerBlock();
		if (!result) { new Notice('No postpartum tracker found'); return; }

		const { data, file, content } = result;
		const entries: SimpleTrackerEntry[] = Array.isArray(data.trackers[moduleId]) ? data.trackers[moduleId] as SimpleTrackerEntry[] : [];
		const active = entries.find(e => e.end === null);

		if (!active) { new Notice(`No active ${displayName.toLowerCase()} timer`); return; }

		active.end = new Date().toISOString();
		active.durationSec = Math.round(
			(new Date(active.end).getTime() - new Date(active.timestamp).getTime()) / 1000
		);
		data.trackers[moduleId] = entries;
		await this.writeTrackerBlock(file, content, data);
		new Notice(`${displayName} stopped (${Math.round(active.durationSec / 60)}m)`);
	}

	/** Log a rating value via modal (mood, pain, etc). */
	private quickLogRating(moduleId: string, displayName: string, min: number, max: number, fieldKey: string): void {
		const modal = new RatingPickerModal(this.app, displayName, min, max, async (value) => {
			const result = await this.findAndParseTrackerBlock();
			if (!result) { new Notice('No postpartum tracker found'); return; }

			const { data, file, content } = result;
			const entries: SimpleTrackerEntry[] = Array.isArray(data.trackers[moduleId]) ? data.trackers[moduleId] as SimpleTrackerEntry[] : [];

			const entry: SimpleTrackerEntry = {
				id: generateId(),
				timestamp: new Date().toISOString(),
				fields: { [fieldKey]: value },
				notes: '',
			};
			entries.push(entry);
			data.trackers[moduleId] = entries;
			await this.writeTrackerBlock(file, content, data);
			new Notice(`${displayName}: ${value}`);
		});
		modal.open();
	}

	/** Log a numeric value via modal (weight, temperature, etc). */
	private quickLogNumeric(moduleId: string, displayName: string, unit: string, fieldKey: string): void {
		const modal = new NumericInputModal(this.app, displayName, unit, async (value) => {
			const result = await this.findAndParseTrackerBlock();
			if (!result) { new Notice('No postpartum tracker found'); return; }

			const { data, file, content } = result;
			const entries: SimpleTrackerEntry[] = Array.isArray(data.trackers[moduleId]) ? data.trackers[moduleId] as SimpleTrackerEntry[] : [];

			const entry: SimpleTrackerEntry = {
				id: generateId(),
				timestamp: new Date().toISOString(),
				fields: { [fieldKey]: value },
				notes: '',
			};
			entries.push(entry);
			data.trackers[moduleId] = entries;
			await this.writeTrackerBlock(file, content, data);
			new Notice(`${displayName}: ${value}${unit}`);
		});
		modal.open();
	}

	/** Navigate to the file containing the tracker code block. */
	private async navigateToTracker(): Promise<void> {
		const result = await this.findAndParseTrackerBlock();
		if (!result) { new Notice('No postpartum tracker found'); return; }
		await this.app.workspace.openLinkText(result.file.path, '', false);
	}

	/** Remove the most recent entry across all modules. */
	private async undoLastEntry(): Promise<void> {
		const result = await this.findAndParseTrackerBlock();
		if (!result) { new Notice('No postpartum tracker found'); return; }

		const { data, file, content } = result;

		// Find the most recent entry across all modules
		let latestKey = '';
		let latestIdx = -1;
		let latestTime = 0;

		for (const [key, entries] of Object.entries(data.trackers)) {
			if (!Array.isArray(entries)) continue;
			for (let i = 0; i < entries.length; i++) {
				const e = entries[i] as Record<string, unknown>;
				const t = new Date((e.start || e.timestamp) as string).getTime();
				if (t > latestTime) {
					latestTime = t;
					latestKey = key;
					latestIdx = i;
				}
			}
		}

		if (latestIdx < 0) { new Notice('No entries to undo'); return; }

		const modal = new ConfirmModal(this.app, 'Undo last entry', `Remove the most recent ${latestKey} entry?`, async () => {
			(data.trackers[latestKey] as unknown[]).splice(latestIdx, 1);
			await this.writeTrackerBlock(file, content, data);
			new Notice(`Last ${latestKey} entry removed`);
		});
		modal.open();
	}

	/** Show a modal with today's summary stats. */
	private async showDailySummary(): Promise<void> {
		const result = await this.findAndParseTrackerBlock();
		if (!result) { new Notice('No postpartum tracker found'); return; }

		const { data } = result;
		const dayStart = new Date();
		dayStart.setHours(0, 0, 0, 0);

		const lines: string[] = [];
		for (const mod of this.registry.getAll()) {
			if (!this.settings.enabledModules.includes(mod.id)) continue;
			const rawEntries = data.trackers[mod.id];
			if (!rawEntries) continue;
			const entries = mod.parseEntries(rawEntries) as unknown[];
			const todayEntries = entries.filter((e) => {
				const rec = e as Record<string, unknown>;
				const t = new Date((rec.start || rec.timestamp) as string);
				return t >= dayStart;
			});
			if (todayEntries.length > 0) {
				lines.push(`**${mod.displayName}**: ${todayEntries.length} entries`);
			}
		}

		if (lines.length === 0) lines.push('No entries logged today.');

		const modal = new DailySummaryModal(this.app, lines);
		modal.open();
	}

	onunload(): void {
		this.notificationService?.stop();
		this.statusBarManager?.stop();
	}

	/**
	 * Rebuild the tracker registry from current settings and refresh all open
	 * tracker widgets so changes take effect without a plugin reload.
	 */
	async rebuildRegistry(): Promise<void> {
		this.registry.clear();

		// Core modules
		this.registry.register(new FeedingTracker());
		this.registry.register(new DiaperTracker());
		this.registry.register(new MedicationTracker());
		this.registry.register(new CommentTracker());

		// Library modules
		for (const def of TRACKER_LIBRARY) {
			if (this.settings.enabledModules.includes(def.id)) {
				const override = this.settings.libraryTrackerOverrides[def.id];
				this.registry.register(new SimpleTrackerModule(def, override));
			}
		}

		// Custom trackers
		for (const def of this.settings.customTrackers) {
			if (this.settings.enabledModules.includes(def.id)) {
				this.registry.register(new SimpleTrackerModule(def));
			}
		}

		// Refresh all active widgets in-place (re-reads settings, rebuilds UI)
		this.refreshAllWidgets();
	}

	async loadSettings(): Promise<void> {
		this.settings = deepMerge(DEFAULT_SETTINGS, await this.loadData());
		this.reconcileMedications();
		this.migrateNotificationPreset();

		// Generate device ID on first run (stored in data.json which is per-device)
		if (!this.settings.deviceId) {
			this.settings.deviceId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
				? crypto.randomUUID()
				: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
					const r = (Math.random() * 16) | 0;
					return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
				});
			await this.saveData(this.settings);
		}
	}

	/** Migrate old single webhookPreset to per-service toggles. */
	private migrateNotificationPreset(): void {
		const notif = this.settings.notifications;
		// If user has webhookEnabled but no per-service toggle is set, migrate
		if (notif.webhookEnabled &&
			!notif.ntfyEnabled && !notif.pushoverEnabled && !notif.gotifyEnabled && !notif.customWebhookEnabled) {
			if (notif.webhookPreset === 'ntfy' && notif.ntfyTopic) {
				notif.ntfyEnabled = true;
			} else if (notif.webhookPreset === 'pushover' && notif.pushoverAppToken) {
				notif.pushoverEnabled = true;
			} else if (notif.webhookPreset === 'gotify' && notif.webhookUrl) {
				notif.gotifyEnabled = true;
				notif.gotifyUrl = notif.webhookUrl;
			} else if (notif.webhookPreset === 'custom' && notif.webhookUrl) {
				notif.customWebhookEnabled = true;
			}
		}
	}

	/** Ensure any new DEFAULT_MEDICATIONS items are added to saved settings. */
	private reconcileMedications(): void {
		const saved = this.settings.medication.medications;
		const savedNames = new Set(saved.map(m => m.name.toLowerCase()));

		for (const defaultMed of DEFAULT_MEDICATIONS) {
			if (!savedNames.has(defaultMed.name.toLowerCase())) {
				saved.push({ ...defaultMed, enabled: false });
			}
		}

		// Backfill category field on items saved before the field existed
		for (const med of saved) {
			if (!med.category) {
				const match = DEFAULT_MEDICATIONS.find(
					d => d.name.toLowerCase() === med.name.toLowerCase()
				);
				med.category = match?.category || 'medication';
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Restart notification service if settings changed
		if (this.notificationService) {
			this.notificationService.stop();
			this.notificationService.start();
		}
		// Debounced rebuild: coalesce rapid onChange saves, then refresh widgets
		if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
		this.rebuildTimer = setTimeout(() => {
			this.rebuildTimer = null;
			this.rebuildRegistry();
		}, 500);
	}
}

/** Suggest modal for picking a medication. */
class MedicationPickerModal extends SuggestModal<MedicationConfig> {
	private items: MedicationConfig[];
	private onChoose: (med: MedicationConfig) => void;

	constructor(app: import('obsidian').App, items: MedicationConfig[], onChoose: (med: MedicationConfig) => void) {
		super(app);
		this.items = items;
		this.onChoose = onChoose;
		this.setPlaceholder('Select medication...');
	}

	getSuggestions(query: string): MedicationConfig[] {
		const q = query.toLowerCase();
		return this.items.filter(m =>
			m.name.toLowerCase().includes(q) ||
			(m.technicalName || '').toLowerCase().includes(q)
		);
	}

	renderSuggestion(med: MedicationConfig, el: HTMLElement): void {
		el.createDiv({ text: `${med.icon} ${med.name}` });
		if (med.dosage) {
			el.createDiv({ cls: 'suggestion-note', text: med.dosage });
		}
	}

	onChooseSuggestion(med: MedicationConfig): void {
		this.onChoose(med);
	}
}

/** Suggest modal for picking any tracker module. */
class TrackerPickerModal extends SuggestModal<{ id: string; name: string }> {
	private items: { id: string; name: string }[];
	private onChoose: (choice: { id: string; name: string }) => void;

	constructor(app: import('obsidian').App, items: { id: string; name: string }[], onChoose: (choice: { id: string; name: string }) => void) {
		super(app);
		this.items = items;
		this.onChoose = onChoose;
		this.setPlaceholder('Select tracker...');
	}

	getSuggestions(query: string): { id: string; name: string }[] {
		const q = query.toLowerCase();
		return this.items.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
	}

	renderSuggestion(item: { id: string; name: string }, el: HTMLElement): void {
		el.createDiv({ text: item.name });
	}

	onChooseSuggestion(item: { id: string; name: string }): void {
		this.onChoose(item);
	}
}

/** Modal with a row of tappable numbered buttons for rating input. */
class RatingPickerModal extends Modal {
	private displayName: string;
	private min: number;
	private max: number;
	private onPick: (value: number) => void;

	constructor(app: import('obsidian').App, displayName: string, min: number, max: number, onPick: (value: number) => void) {
		super(app);
		this.displayName = displayName;
		this.min = min;
		this.max = max;
		this.onPick = onPick;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: this.displayName });
		const row = contentEl.createDiv({ cls: 'pt-rating-picker-row' });
		for (let i = this.min; i <= this.max; i++) {
			const btn = row.createEl('button', { cls: 'pt-rating-btn', text: String(i) });
			btn.addEventListener('click', () => {
				this.onPick(i);
				this.close();
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Modal with a single number input + unit label. */
class NumericInputModal extends Modal {
	private displayName: string;
	private unit: string;
	private onSubmit: (value: number) => void;

	constructor(app: import('obsidian').App, displayName: string, unit: string, onSubmit: (value: number) => void) {
		super(app);
		this.displayName = displayName;
		this.unit = unit;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: this.displayName });

		const row = contentEl.createDiv({ cls: 'pt-numeric-input-row' });
		const input = row.createEl('input', {
			cls: 'pt-modal-input',
			attr: { type: 'number', placeholder: '0' },
		});
		row.createSpan({ text: ` ${this.unit}` });

		const btnRow = contentEl.createDiv({ cls: 'pt-modal-buttons' });
		const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
		const saveBtn = btnRow.createEl('button', { text: 'Save', cls: 'mod-cta' });

		cancelBtn.addEventListener('click', () => this.close());
		saveBtn.addEventListener('click', () => {
			const val = parseFloat(input.value);
			if (!isNaN(val)) {
				this.onSubmit(val);
			}
			this.close();
		});

		input.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Simple confirmation modal. */
class ConfirmModal extends Modal {
	private title: string;
	private message: string;
	private onConfirm: () => void;

	constructor(app: import('obsidian').App, title: string, message: string, onConfirm: () => void) {
		super(app);
		this.title = title;
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: this.title });
		contentEl.createEl('p', { text: this.message });

		const btnRow = contentEl.createDiv({ cls: 'pt-modal-buttons' });
		const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
		const confirmBtn = btnRow.createEl('button', { text: 'Confirm', cls: 'mod-cta mod-warning' });

		cancelBtn.addEventListener('click', () => this.close());
		confirmBtn.addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Modal showing today's summary stats. */
class DailySummaryModal extends Modal {
	private lines: string[];

	constructor(app: import('obsidian').App, lines: string[]) {
		super(app);
		this.lines = lines;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: "Today's summary" });
		for (const line of this.lines) {
			const p = contentEl.createEl('p');
			// Simple markdown bold support
			const parts = line.split(/(\*\*.*?\*\*)/);
			for (const part of parts) {
				if (part.startsWith('**') && part.endsWith('**')) {
					p.createEl('strong', { text: part.slice(2, -2) });
				} else {
					p.appendText(part);
				}
			}
		}
		const btnRow = contentEl.createDiv({ cls: 'pt-modal-buttons' });
		btnRow.createEl('button', { text: 'Close', cls: 'mod-cta' })
			.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

interface BackupItem {
	path: string;
	counts: Record<string, number>;
	latestEntry: string;
}

/** Backup picker with entry counts and latest event info. */
class BackupPickerModal extends SuggestModal<BackupItem> {
	private items: BackupItem[];
	private onChooseItem: (item: BackupItem) => void;

	constructor(app: import('obsidian').App, items: BackupItem[], onChoose: (item: BackupItem) => void) {
		super(app);
		this.items = items;
		this.onChooseItem = onChoose;
		this.setPlaceholder('Pick a backup to restore...');
	}

	getSuggestions(query: string): BackupItem[] {
		const q = query.toLowerCase();
		return this.items.filter(item => {
			const name = item.path.substring(item.path.lastIndexOf('/') + 1);
			return name.toLowerCase().includes(q);
		});
	}

	renderSuggestion(item: BackupItem, el: HTMLElement): void {
		// Timestamp line
		const name = item.path.substring(item.path.lastIndexOf('/') + 1).replace('.json', '');
		const readable = name.replace(/T/, ' ').replace(/-(\d{2})-(\d{2})-/, ':$1:$2.');
		const titleEl = el.createDiv({ cls: 'pt-backup-title' });
		titleEl.style.fontWeight = '600';
		titleEl.style.marginBottom = '2px';
		titleEl.setText(readable);

		// Entry counts
		const countsEl = el.createDiv({ cls: 'pt-backup-counts' });
		countsEl.style.fontSize = '0.8em';
		countsEl.style.color = 'var(--text-muted)';
		const icons: Record<string, string> = {
			feeding: '🤱', sleep: '😴', diaper: '🧷', medication: '💊',
			hiccups: '🫁', pain: '😣', 'tummy-time': '👶', bleeding: '🩸',
		};
		const parts: string[] = [];
		for (const [k, count] of Object.entries(item.counts)) {
			if (k === 'medicationConfig' || k === 'logNotes' || k === 'comments') continue;
			const icon = icons[k] || '📋';
			parts.push(`${icon} ${count} ${k}`);
		}
		countsEl.setText(parts.join('  '));

		// Latest entry
		if (item.latestEntry) {
			const latestEl = el.createDiv({ cls: 'pt-backup-latest' });
			latestEl.style.fontSize = '0.75em';
			latestEl.style.color = 'var(--text-faint)';
			const d = new Date(item.latestEntry);
			const timeStr = d.toLocaleString(undefined, {
				month: 'short', day: 'numeric',
				hour: 'numeric', minute: '2-digit',
			});
			latestEl.setText(`Latest entry: ${timeStr}`);
		}
	}

	onChooseSuggestion(item: BackupItem): void {
		this.onChooseItem(item);
	}
}
