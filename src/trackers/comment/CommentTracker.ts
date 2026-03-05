import type { App } from 'obsidian';
import type { TrackerModule } from '../BaseTracker';
import type { LogNoteEntry, PostpartumTrackerSettings, QuickAction, TrackerEvent, TrackerCategory } from '../../types';
import { formatTime, generateId } from '../../utils/formatters';
import { filterRecent } from '../../data/dateUtils';
import { EntryList, type EntryListItem } from '../../widget/shared/EntryList';
import { InlineEditPanel, type EditField } from '../../widget/shared/InlineEditPanel';
import { TrackerEditModal } from '../../ui/TrackerEditModal';

const COMMENT_CATEGORIES = [
	{ value: 'general', label: 'General' },
	{ value: 'concern', label: 'Concern' },
	{ value: 'milestone', label: 'Milestone' },
	{ value: 'reminder', label: 'Reminder' },
];

export interface CommentStats {
	totalNotes: number;
}

export class CommentTracker implements TrackerModule<LogNoteEntry, CommentStats> {
	readonly id = 'comments';
	readonly displayName = 'Notes & comments';
	readonly defaultExpanded = false;
	readonly defaultOrder = 10;
	readonly category: TrackerCategory = 'general';
	readonly icon = '\uD83D\uDCDD';
	readonly description = 'Free-text timestamped notes and comments.';

	private entries: LogNoteEntry[] = [];
	private save: (() => Promise<void>) | null = null;
	private settings: PostpartumTrackerSettings | null = null;
	private emitEvent: ((event: TrackerEvent) => void) | null = null;
	private app: App | null = null;

	// UI
	private bodyEl: HTMLElement | null = null;
	private editPanelContainer: HTMLElement | null = null;
	private entryList: EntryList | null = null;
	private currentEditPanel: InlineEditPanel | null = null;

	parseEntries(raw: unknown): LogNoteEntry[] {
		if (!Array.isArray(raw)) return [];
		return raw as LogNoteEntry[];
	}

	serializeEntries(): LogNoteEntry[] {
		return this.entries;
	}

	emptyEntries(): LogNoteEntry[] {
		return [];
	}

	update(entries: LogNoteEntry[]): void {
		this.entries = entries;
		this.refreshUI();
	}

	buildUI(
		bodyEl: HTMLElement,
		save: () => Promise<void>,
		settings: PostpartumTrackerSettings,
		emitEvent?: (event: TrackerEvent) => void,
		app?: App
	): void {
		this.save = save;
		this.settings = settings;
		this.emitEvent = emitEvent || null;
		this.app = app || null;
		this.bodyEl = bodyEl;

		this.editPanelContainer = bodyEl.createDiv({ cls: 'pt-edit-panel-container' });

		this.entryList = new EntryList(bodyEl, 'No notes yet');
		this.entryList.setCallbacks(
			(id) => this.editEntry(id),
			(id) => this.deleteEntry(id)
		);

		this.refreshUI();
	}

	getQuickActions(): QuickAction[] {
		return [{
			id: 'comment-add',
			label: 'Add note',
			icon: '\uD83D\uDCDD',
			cls: 'pt-quick-btn--comment',
			onClick: (ts) => this.addNote(ts),
			labelEssential: true,
		}];
	}

	computeStats(entries: LogNoteEntry[], _dayStart: Date): CommentStats {
		return { totalNotes: entries.length };
	}

	renderSummary(el: HTMLElement, stats: CommentStats): void {
		const card = el.createDiv({ cls: 'pt-module-summary-card' });
		card.createDiv({ cls: 'pt-module-summary-value', text: String(stats.totalNotes) });
		card.createDiv({ cls: 'pt-module-summary-label', text: 'Notes' });
	}

	// ── Actions ──

	private addNote(timestamp?: string): void {
		this.dismissEditPanel();

		const fields: EditField[] = [
			{ key: 'time', label: 'Time', type: 'datetime', value: timestamp || new Date().toISOString() },
			{
				key: 'category', label: 'Category', type: 'select', value: 'general',
				options: COMMENT_CATEGORIES,
			},
			{ key: 'text', label: 'Note', type: 'text', value: '', placeholder: 'What happened?' },
		];

		const onSave = async (values: Record<string, string>) => {
			if (!values.text.trim()) return;

			const entry: LogNoteEntry = {
				id: generateId(),
				timestamp: values.time,
				category: values.category || 'general',
				text: values.text.trim(),
			};

			this.entries.push(entry);
			this.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			this.emitEvent?.({ type: 'comment-logged', entry });
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, 'Add note', fields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, 'Add note', fields, onSave,
				() => this.dismissEditPanel()
			);
		}
	}

	editEntry(id: string): void {
		const entry = this.entries.find(e => e.id === id);
		if (!entry) return;

		this.dismissEditPanel();

		const fields: EditField[] = [
			{ key: 'time', label: 'Time', type: 'datetime', value: entry.timestamp },
			{
				key: 'category', label: 'Category', type: 'select', value: entry.category,
				options: COMMENT_CATEGORIES,
			},
			{ key: 'text', label: 'Note', type: 'text', value: entry.text, placeholder: 'What happened?' },
		];

		const onSave = async (values: Record<string, string>) => {
			entry.timestamp = values.time;
			entry.category = values.category || 'general';
			entry.text = values.text.trim() || entry.text;

			this.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, 'Edit note', fields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, 'Edit note', fields, onSave,
				() => this.dismissEditPanel()
			);
		}
	}

	private dismissEditPanel(): void {
		if (this.currentEditPanel) {
			this.currentEditPanel.destroy();
			this.currentEditPanel = null;
		}
	}

	async deleteEntry(id: string): Promise<void> {
		this.entries = this.entries.filter(e => e.id !== id);
		this.refreshUI();
		if (this.save) await this.save();
	}

	// ── UI ──

	private refreshUI(): void {
		if (!this.entryList) return;

		const recentEntries = filterRecent(this.entries, e => e.timestamp, this.settings?.entryWindowHours ?? 24);
		const items: EntryListItem[] = recentEntries.map(e => {
			const catLabel = e.category !== 'general' ? ` [${e.category}]` : '';
			return {
				id: e.id,
				time: formatTime(e.timestamp, this.settings?.timeFormat),
				icon: '\uD83D\uDCDD',
				text: e.text,
				subtext: catLabel || undefined,
			};
		});
		this.entryList.update(items);
	}

	addEntry(data: Record<string, unknown>): void {
		const entry: LogNoteEntry = {
			id: generateId(),
			timestamp: (data.timestamp as string) || new Date().toISOString(),
			category: (data.category as string) || 'general',
			text: (data.text as string) || '',
		};

		if (!entry.text) return;

		this.entries.push(entry);
		this.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		this.emitEvent?.({ type: 'comment-logged', entry });
		this.refreshUI();
		this.save?.();
	}
}
