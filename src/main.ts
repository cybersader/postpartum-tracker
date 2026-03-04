import { Editor, Notice, Plugin, TFile } from 'obsidian';
import type { PostpartumTrackerSettings, TrackerEvent } from './types';
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
import { TRACKER_LIBRARY } from './trackers/library';
import { NotificationService } from './notifications/NotificationService';
import { TodoistService } from './integrations/TodoistService';

export default class PostpartumTrackerPlugin extends Plugin {
	settings: PostpartumTrackerSettings = DEFAULT_SETTINGS;
	registry: TrackerRegistry = new TrackerRegistry();
	notificationService!: NotificationService;
	todoistService!: TodoistService;
	private store!: CodeBlockStore;

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

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new CodeBlockStore(this.app);

		// Register core tracker modules
		this.registry.register(new FeedingTracker());
		this.registry.register(new DiaperTracker());
		this.registry.register(new MedicationTracker());

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
			(source, el, ctx) => {
				const data = this.store.parse(source);
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

		// Status bar item for notifications
		const statusBarEl = this.addStatusBarItem();
		statusBarEl.addClass('pt-status-bar');

		// Notification service
		this.notificationService = new NotificationService(this);
		this.notificationService.setStatusBarEl(statusBarEl);
		this.notificationService.start();

		// Todoist integration
		this.todoistService = new TodoistService(this);

		// Wire tracker events → Todoist
		this.onTrackerEvent('feeding-logged', (e) => this.todoistService.onTrackerEvent(e));
		this.onTrackerEvent('medication-logged', (e) => this.todoistService.onTrackerEvent(e));
		this.onTrackerEvent('diaper-logged', (e) => this.todoistService.onTrackerEvent(e));
		this.onTrackerEvent('simple-logged', (e) => this.todoistService.onTrackerEvent(e));

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
			const files = this.app.vault.getMarkdownFiles();
			for (const file of files) {
				const content = await this.app.vault.cachedRead(file);
				const match = content.match(/```postpartum-tracker\n([\s\S]*?)\n```/);
				if (!match?.[1]) continue;

				const data = this.store.parse(match[1]);
				const entries = data.trackers[moduleId];
				if (!Array.isArray(entries)) continue;

				entries.push(event.entry as never);

				// Sort by timestamp/start
				entries.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
					const aTime = (a.start || a.timestamp) as string;
					const bTime = (b.start || b.timestamp) as string;
					return new Date(aTime).getTime() - new Date(bTime).getTime();
				});

				const json = JSON.stringify(data);
				const newContent = content.replace(
					/```postpartum-tracker\n[\s\S]*?\n```/,
					`\`\`\`postpartum-tracker\n${json}\n\`\`\``
				);

				await this.app.vault.modify(file, newContent);
				return; // Only modify the first matching file
			}
		} catch (e) {
			console.warn('Postpartum Tracker: failed to write Todoist entry to vault', e);
		}
	}

	onunload(): void {
		this.notificationService?.stop();
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

		// Force Obsidian to re-render all postpartum-tracker code blocks by
		// touching each file that contains one.  vault.process() with an
		// identity transform triggers the code-block processor again.
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const content = await this.app.vault.cachedRead(file);
			if (content.includes('```postpartum-tracker')) {
				// Trigger a re-read by the editor – a no-op modify is enough
				await this.app.vault.process(file, (c) => c);
			}
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = deepMerge(DEFAULT_SETTINGS, await this.loadData());
		this.reconcileMedications();
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
	}
}
