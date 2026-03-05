import type { App } from 'obsidian';
import type { TrackerModule } from '../BaseTracker';
import type { DiaperEntry, DiaperColor, PostpartumTrackerSettings, QuickAction, HealthAlert, TrackerEvent } from '../../types';
import { DiaperStats, computeDiaperStats, getDiaperAlerts } from './diaperStats';
import { formatTime, generateId } from '../../utils/formatters';
import { div, span } from '../../utils/dom';
import { filterToday, filterRecent } from '../../data/dateUtils';
import { EntryList, type EntryListItem } from '../../widget/shared/EntryList';
import { InlineEditPanel, type EditField } from '../../widget/shared/InlineEditPanel';
import { TrackerEditModal } from '../../ui/TrackerEditModal';

const DIAPER_COLORS: { value: DiaperColor; label: string; cssColor: string }[] = [
	{ value: 'meconium', label: 'Meconium', cssColor: '#1a1a2e' },
	{ value: 'transitional', label: 'Transitional', cssColor: '#2d5016' },
	{ value: 'yellow-seedy', label: 'Yellow seedy', cssColor: '#d4a017' },
	{ value: 'green', label: 'Green', cssColor: '#4a7c3f' },
	{ value: 'brown', label: 'Brown', cssColor: '#6b4226' },
	{ value: 'other', label: 'Other', cssColor: '#888888' },
];

export class DiaperTracker implements TrackerModule<DiaperEntry, DiaperStats> {
	readonly id = 'diaper';
	readonly displayName = 'Diapers';
	readonly defaultExpanded = true;
	readonly defaultOrder = 1;

	private entries: DiaperEntry[] = [];
	private save: (() => Promise<void>) | null = null;
	private settings: PostpartumTrackerSettings | null = null;
	private emitEvent: ((event: TrackerEvent) => void) | null = null;
	private app: App | null = null;

	// UI
	private bodyEl: HTMLElement | null = null;
	private editPanelContainer: HTMLElement | null = null;
	private colorPickerEl: HTMLElement | null = null;
	private pendingEntryId: string | null = null;
	private entryList: EntryList | null = null;
	private statsEl: HTMLElement | null = null;
	private currentEditPanel: InlineEditPanel | null = null;

	parseEntries(raw: unknown): DiaperEntry[] {
		if (!Array.isArray(raw)) return [];
		return raw as DiaperEntry[];
	}

	serializeEntries(): DiaperEntry[] {
		return this.entries;
	}

	emptyEntries(): DiaperEntry[] {
		return [];
	}

	update(entries: DiaperEntry[]): void {
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

		// Container for edit panels (always at top)
		this.editPanelContainer = bodyEl.createDiv({ cls: 'pt-edit-panel-container' });

		// Color picker (hidden by default, shown after dirty/both)
		this.colorPickerEl = bodyEl.createDiv({ cls: 'pt-diaper-color-picker pt-hidden' });
		this.colorPickerEl.createDiv({ cls: 'pt-color-picker-label', text: 'Stool color:' });
		const swatchRow = this.colorPickerEl.createDiv({ cls: 'pt-color-swatches' });
		for (const color of DIAPER_COLORS) {
			const wrap = swatchRow.createDiv({ cls: 'pt-color-swatch-wrap' });
			const swatch = wrap.createEl('button', {
				cls: 'pt-color-swatch',
				title: color.label,
			});
			swatch.style.backgroundColor = color.cssColor;
			wrap.createDiv({ cls: 'pt-color-swatch-label', text: color.label });
			swatch.addEventListener('click', () => this.selectColor(color.value));
			wrap.addEventListener('click', () => this.selectColor(color.value));
		}
		// Skip color button
		const skipBtn = this.colorPickerEl.createEl('button', {
			cls: 'pt-color-skip',
			text: 'Skip',
		});
		skipBtn.addEventListener('click', () => this.dismissColorPicker());

		// Description input (shown with color picker)
		const descRow = this.colorPickerEl.createDiv({ cls: 'pt-diaper-desc-row' });
		descRow.createSpan({ text: 'Notes: ' });
		const descInput = descRow.createEl('input', {
			cls: 'pt-diaper-desc-input',
			attr: { type: 'text', placeholder: 'Consistency, amount, etc.' },
		});
		descInput.dataset.role = 'diaper-desc';

		// Stats line
		this.statsEl = bodyEl.createDiv({ cls: 'pt-diaper-stats' });

		// Entry list
		this.entryList = new EntryList(bodyEl, 'No diaper changes today');
		this.entryList.setCallbacks(
			(id) => this.editEntry(id),
			(id) => this.deleteEntry(id)
		);

		this.refreshUI();
	}

	getQuickActions(): QuickAction[] {
		const cfg = this.settings?.diaper?.buttons;
		const holdForDetails = cfg?.holdForDetails ?? true;
		const actions: QuickAction[] = [];

		const mkBtn = (
			id: string, key: 'wet' | 'dirty' | 'both',
			defLabel: string, defIcon: string, cls: string,
			wet: boolean, dirty: boolean
		) => {
			const btnCfg = cfg?.[key];
			if (btnCfg && !btnCfg.visible) return;
			actions.push({
				id,
				label: btnCfg?.label || defLabel,
				icon: btnCfg?.icon || defIcon,
				cls,
				onClick: (ts) => this.logDiaper(wet, dirty, ts),
				onLongPress: holdForDetails ? (ts) => this.logDiaperWithDetails(wet, dirty, ts) : undefined,
			});
		};

		mkBtn('diaper-wet', 'wet', 'Wet', '\uD83D\uDCA7', 'pt-quick-btn--diaper-wet', true, false);
		mkBtn('diaper-dirty', 'dirty', 'Dirty', '\uD83D\uDCA9', 'pt-quick-btn--diaper-dirty', false, true);
		mkBtn('diaper-both', 'both', 'Both', '\uD83D\uDCA7\uD83D\uDCA9', 'pt-quick-btn--diaper-both', true, true);

		return actions;
	}

	computeStats(entries: DiaperEntry[], dayStart: Date): DiaperStats {
		return computeDiaperStats(entries, dayStart);
	}

	renderSummary(el: HTMLElement, stats: DiaperStats): void {
		const card = el.createDiv({ cls: 'pt-module-summary-card' });
		card.createDiv({ cls: 'pt-module-summary-value', text: String(stats.totalChanges) });
		card.createDiv({ cls: 'pt-module-summary-label', text: 'Diapers' });
		card.createDiv({
			cls: 'pt-module-summary-sublabel',
			text: `${stats.totalWet}W ${stats.totalDirty}D`,
		});
	}

	getAlerts(entries: DiaperEntry[], dayStart: Date, birthDate?: string): HealthAlert[] {
		return getDiaperAlerts(entries, dayStart, birthDate);
	}

	// ── Actions ──

	/** Long-press: open a detail form before logging the diaper entry. */
	private logDiaperWithDetails(wet: boolean, dirty: boolean, timestamp?: string): void {
		this.dismissEditPanel();

		const fields: EditField[] = [
			{ key: 'time', label: 'Time', type: 'datetime', value: timestamp || new Date().toISOString() },
		];

		if (dirty) {
			fields.push({
				key: 'color', label: 'Stool color', type: 'select', value: '',
				options: [
					{ value: '', label: 'None' },
					...DIAPER_COLORS.map(c => ({ value: c.value, label: c.label })),
				],
			});
		}

		fields.push(
			{ key: 'description', label: 'Description', type: 'text', value: '', placeholder: 'Consistency, amount, etc.' },
			{ key: 'notes', label: 'Notes', type: 'text', value: '', placeholder: 'Optional' },
		);

		const onSave = async (values: Record<string, string>) => {
			const entry: DiaperEntry = {
				id: generateId(),
				timestamp: values.time,
				wet,
				dirty,
				color: (values.color || undefined) as DiaperColor | undefined,
				description: values.description || '',
				notes: values.notes || '',
			};

			this.entries.push(entry);
			this.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			this.emitEvent?.({ type: 'diaper-logged', entry });
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, 'Log diaper change', fields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, 'Log diaper change', fields, onSave,
				() => this.dismissEditPanel()
			);
		}
	}

	private async logDiaper(wet: boolean, dirty: boolean, timestamp?: string): Promise<void> {
		const entry: DiaperEntry = {
			id: generateId(),
			timestamp: timestamp || new Date().toISOString(),
			wet,
			dirty,
			description: '',
			notes: '',
		};

		this.entries.push(entry);
		// Sort by timestamp to keep order
		this.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

		if (dirty && this.settings?.diaper.showColorPicker) {
			// In modal mode, show a modal for color + description
			if (this.settings?.inputMode === 'modal' && this.app) {
				this.showColorPickerModal(entry);
			} else {
				this.pendingEntryId = entry.id;
				this.showColorPicker();
			}
		} else {
			this.emitEvent?.({ type: 'diaper-logged', entry });
			this.refreshUI();
			if (this.save) await this.save();
		}
	}

	/** Modal-based color picker for dirty diapers. */
	private showColorPickerModal(entry: DiaperEntry): void {
		const fields: EditField[] = [
			{
				key: 'color', label: 'Stool color', type: 'select', value: '',
				options: [
					{ value: '', label: 'Skip' },
					...DIAPER_COLORS.map(c => ({ value: c.value, label: c.label })),
				],
			},
			{ key: 'description', label: 'Description', type: 'text', value: '', placeholder: 'Consistency, amount, etc.' },
		];

		const onSave = async (values: Record<string, string>) => {
			if (values.color) entry.color = values.color as DiaperColor;
			if (values.description) entry.description = values.description;
			this.emitEvent?.({ type: 'diaper-logged', entry });
			this.refreshUI();
			if (this.save) await this.save();
		};

		new TrackerEditModal(this.app!, 'Stool details', fields, onSave, () => {
			// On cancel, still save the entry (just without color/desc)
			this.emitEvent?.({ type: 'diaper-logged', entry });
			this.refreshUI();
			this.save?.();
		}).open();
	}

	private showColorPicker(): void {
		if (this.colorPickerEl) {
			this.colorPickerEl.removeClass('pt-hidden');
			// Clear description input
			const input = this.colorPickerEl.querySelector('[data-role="diaper-desc"]') as HTMLInputElement;
			if (input) input.value = '';
		}
	}

	private async selectColor(color: DiaperColor): Promise<void> {
		if (this.pendingEntryId) {
			const entry = this.entries.find(e => e.id === this.pendingEntryId);
			if (entry) {
				entry.color = color;
				// Grab description from input
				const input = this.colorPickerEl?.querySelector('[data-role="diaper-desc"]') as HTMLInputElement;
				if (input && input.value.trim()) {
					entry.description = input.value.trim();
				}
				this.emitEvent?.({ type: 'diaper-logged', entry });
			}
		}
		this.dismissColorPicker();
		this.refreshUI();
		if (this.save) await this.save();
	}

	private async dismissColorPicker(): Promise<void> {
		if (this.colorPickerEl) {
			// Grab description even on skip
			if (this.pendingEntryId) {
				const entry = this.entries.find(e => e.id === this.pendingEntryId);
				const input = this.colorPickerEl.querySelector('[data-role="diaper-desc"]') as HTMLInputElement;
				if (entry && input && input.value.trim()) {
					entry.description = input.value.trim();
				}
			}
			this.colorPickerEl.addClass('pt-hidden');
		}
		this.pendingEntryId = null;
		this.refreshUI();
		if (this.save) await this.save();
	}

	async editEntry(id: string): Promise<void> {
		const entry = this.entries.find(e => e.id === id);
		if (!entry) return;

		this.dismissEditPanel();

		const colorOptions = [
			{ value: '', label: 'None' },
			...DIAPER_COLORS.map(c => ({ value: c.value, label: c.label })),
		];

		const fields: EditField[] = [
			{ key: 'time', label: 'Time', type: 'datetime', value: entry.timestamp },
			{ key: 'description', label: 'Description', type: 'text', value: entry.description || '', placeholder: 'Consistency, amount, etc.' },
			{ key: 'notes', label: 'Notes', type: 'text', value: entry.notes || '', placeholder: 'Optional' },
		];

		if (entry.dirty) {
			fields.splice(1, 0, {
				key: 'color', label: 'Stool color', type: 'select',
				value: entry.color || '',
				options: colorOptions,
			});
		}

		const onSave = async (values: Record<string, string>) => {
			entry.timestamp = values.time;
			if (values.color !== undefined) entry.color = (values.color || undefined) as DiaperColor | undefined;
			entry.description = values.description || '';
			entry.notes = values.notes || '';

			this.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, 'Edit diaper change', fields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, 'Edit diaper change', fields, onSave,
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

	// ── UI Refresh ──

	private refreshUI(): void {
		if (this.statsEl) {
			this.statsEl.empty();
			const stats = computeDiaperStats(this.entries);
			if (stats.totalChanges > 0) {
				span(this.statsEl, 'pt-diaper-stat',
					`Today: ${stats.totalWet} wet, ${stats.totalDirty} dirty`
				);
				if (stats.lastChangeAgo) {
					span(this.statsEl, 'pt-diaper-stat', ` \u2022 Last: ${stats.lastChangeAgo}`);
				}
			}
		}

		if (this.entryList) {
			const recentEntries = filterRecent(this.entries, e => e.timestamp, this.settings?.entryWindowHours ?? 24);
			const items: EntryListItem[] = recentEntries.map(e => {
				const parts: string[] = [];
				if (e.wet) parts.push('wet');
				if (e.dirty) parts.push('dirty');
				const icon = e.wet && e.dirty ? '\uD83D\uDCA7\uD83D\uDCA9' : e.wet ? '\uD83D\uDCA7' : '\uD83D\uDCA9';
				const colorLabel = e.color ? ` (${e.color.replace('-', ' ')})` : '';
				return {
					id: e.id,
					time: formatTime(e.timestamp, this.settings?.timeFormat),
					icon,
					text: parts.join(' + ') + colorLabel,
					subtext: e.description || e.notes || undefined,
					rawTimestamp: e.timestamp,
				};
			}).reverse();
			this.entryList.update(items);
		}
	}

	addEntry(data: Record<string, unknown>): void {
		const entry: DiaperEntry = {
			id: generateId(),
			timestamp: (data.timestamp as string) || new Date().toISOString(),
			wet: Boolean(data.wet),
			dirty: Boolean(data.dirty),
			color: (data.color as DiaperColor) || undefined,
			description: (data.description as string) || '',
			notes: (data.notes as string) || '',
		};

		this.entries.push(entry);
		this.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		this.emitEvent?.({ type: 'diaper-logged', entry });
		this.refreshUI();
		this.save?.();
	}
}
