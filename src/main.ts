import { Editor, Notice, Plugin, TFile } from 'obsidian';
import type { PostpartumTrackerSettings, TrackerEvent } from './types';
import { DEFAULT_SETTINGS, EMPTY_DATA } from './types';
import { CodeBlockStore } from './data/CodeBlockStore';
import { TrackerRegistry } from './data/TrackerRegistry';
import { TrackerWidget } from './widget/TrackerWidget';
import { PostpartumTrackerSettingsTab } from './settings';
import { deepMerge } from './utils/deepMerge';
import { FeedingTracker } from './trackers/feeding/FeedingTracker';
import { DiaperTracker } from './trackers/diaper/DiaperTracker';
import { MedicationTracker } from './trackers/medication/MedicationTracker';
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

		// Register tracker modules
		this.registry.register(new FeedingTracker());
		this.registry.register(new DiaperTracker());
		this.registry.register(new MedicationTracker());

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

	async loadSettings(): Promise<void> {
		this.settings = deepMerge(DEFAULT_SETTINGS, await this.loadData());
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
