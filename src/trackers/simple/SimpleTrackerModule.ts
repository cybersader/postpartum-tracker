/**
 * Generic tracker module instantiated from a SimpleTrackerDef.
 * Dynamically renders forms from field definitions — no custom code per tracker.
 */

import type { App } from 'obsidian';
import type { TrackerModule } from '../BaseTracker';
import type {
	SimpleTrackerDef,
	SimpleTrackerEntry,
	SimpleTrackerField,
	PostpartumTrackerSettings,
	QuickAction,
	HealthAlert,
	TrackerEvent,
	TrackerCategory,
	LibraryTrackerOverride,
} from '../../types';
import { SimpleTrackerStats, computeSimpleTrackerStats } from './simpleTrackerStats';
import { formatTime, formatDuration, formatDurationShort, generateId } from '../../utils/formatters';
import { div, span } from '../../utils/dom';
import { filterToday, timeAgo } from '../../data/dateUtils';
import { EntryList, type EntryListItem } from '../../widget/shared/EntryList';
import { TimerDisplay } from '../../widget/shared/TimerDisplay';
import { InlineEditPanel, type EditField } from '../../widget/shared/InlineEditPanel';
import { TrackerEditModal } from '../../ui/TrackerEditModal';

export class SimpleTrackerModule implements TrackerModule<SimpleTrackerEntry, SimpleTrackerStats> {
	readonly id: string;
	readonly displayName: string;
	readonly defaultExpanded = false;
	readonly defaultOrder: number;
	readonly category: TrackerCategory;
	readonly icon: string;
	readonly description: string;
	readonly isSmart: boolean;

	private def: SimpleTrackerDef;
	private entries: SimpleTrackerEntry[] = [];
	private save: (() => Promise<void>) | null = null;
	private settings: PostpartumTrackerSettings | null = null;
	private emitEvent: ((event: TrackerEvent) => void) | null = null;
	private app: App | null = null;

	// UI elements
	private bodyEl: HTMLElement | null = null;
	private editPanelContainer: HTMLElement | null = null;
	private timerDisplay: TimerDisplay | null = null;
	private timerSection: HTMLElement | null = null;
	private stopBtn: HTMLButtonElement | null = null;
	private entryList: EntryList | null = null;
	private statsEl: HTMLElement | null = null;
	private currentEditPanel: InlineEditPanel | null = null;

	constructor(def: SimpleTrackerDef, override?: LibraryTrackerOverride) {
		this.def = def;
		this.id = def.id;
		this.displayName = override?.displayName || def.displayName;
		this.defaultOrder = def.defaultOrder;
		this.category = def.category;
		this.icon = override?.icon || def.icon;
		this.description = def.description;
		this.isSmart = def.isSmart;

		// Apply notification overrides
		if (override?.notification && def.notificationConfig) {
			this.def = {
				...def,
				notificationConfig: {
					...def.notificationConfig,
					reminderEnabled: override.notification.reminderEnabled,
					reminderIntervalHours: override.notification.reminderIntervalHours,
				},
			};
		}
	}

	parseEntries(raw: unknown): SimpleTrackerEntry[] {
		if (!Array.isArray(raw)) return [];
		return raw as SimpleTrackerEntry[];
	}

	serializeEntries(): SimpleTrackerEntry[] {
		return this.entries;
	}

	emptyEntries(): SimpleTrackerEntry[] {
		return [];
	}

	update(entries: SimpleTrackerEntry[]): void {
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

		// Container for edit panels
		this.editPanelContainer = bodyEl.createDiv({ cls: 'pt-edit-panel-container' });

		// Timer section (only for duration-based trackers)
		if (this.def.hasDuration) {
			this.timerSection = bodyEl.createDiv({ cls: 'pt-simple-timer-section pt-hidden' });
			this.timerDisplay = new TimerDisplay(this.timerSection);
			this.stopBtn = this.timerSection.createEl('button', {
				cls: 'pt-big-button pt-btn-stop',
				text: `Stop ${this.def.displayName.toLowerCase()}`,
			});
			this.addButtonHandler(this.stopBtn, () => this.stopTimer());
		}

		// Stats line
		this.statsEl = bodyEl.createDiv({ cls: 'pt-simple-stats' });

		// Entry list
		this.entryList = new EntryList(bodyEl, `No ${this.def.displayName.toLowerCase()} entries today`);
		this.entryList.setCallbacks(
			(id) => this.editEntry(id),
			(id) => this.deleteEntry(id)
		);

		this.refreshUI();
	}

	getQuickActions(): QuickAction[] {
		// Check for a primary select field (first field, required, type=select with <=4 options)
		// If found, generate one quick button per option for one-tap logging
		const primarySelect = this.def.fields.length > 0 && this.def.fields[0].type === 'select'
			&& this.def.fields[0].options && this.def.fields[0].options.length <= 4
			? this.def.fields[0]
			: null;

		if (primarySelect && primarySelect.options) {
			return primarySelect.options.map(option => ({
				id: `${this.id}-${option}`,
				label: `${option}\n${this.def.displayName}`,
				icon: this.def.icon,
				cls: `pt-quick-btn--${this.id}`,
				onClick: (ts) => this.onQuickSelectAction(primarySelect.key, option, ts),
				labelEssential: true,
			}));
		}

		if (this.def.hasDuration) {
			return [
				{
					id: `${this.id}-start`,
					label: this.def.displayName,
					icon: this.def.icon,
					cls: `pt-quick-btn--${this.id}`,
					onClick: (ts) => this.onQuickAction(ts),
					labelEssential: true,
				},
			];
		}

		// No fields at all: one-tap log
		if (this.def.fields.length === 0) {
			return [
				{
					id: `${this.id}-log`,
					label: this.def.displayName,
					icon: this.def.icon,
					cls: `pt-quick-btn--${this.id}`,
					onClick: (ts) => this.quickLog(ts),
					labelEssential: true,
				},
			];
		}

		// Has fields but no primary select: show form
		return [
			{
				id: `${this.id}-log`,
				label: this.def.displayName,
				icon: this.def.icon,
				cls: `pt-quick-btn--${this.id}`,
				onClick: (ts) => this.showLogForm(ts),
				labelEssential: true,
			},
		];
	}

	getActiveActionIds(): string[] {
		if (!this.def.hasDuration) return [];
		const active = this.entries.find(e => e.end === null);
		return active ? [`${this.id}-start`] : [];
	}

	computeStats(entries: SimpleTrackerEntry[], dayStart: Date): SimpleTrackerStats {
		// Find a numeric field for "last value" display
		const numericField = this.def.fields.find(f => f.type === 'number');
		return computeSimpleTrackerStats(entries, dayStart, numericField?.key);
	}

	renderSummary(el: HTMLElement, stats: SimpleTrackerStats): void {
		const card = el.createDiv({ cls: 'pt-module-summary-card' });
		card.createDiv({ cls: 'pt-module-summary-value', text: String(stats.todayCount) });
		card.createDiv({ cls: 'pt-module-summary-label', text: this.def.displayName });
		if (stats.lastAgo) {
			card.createDiv({ cls: 'pt-module-summary-sublabel', text: stats.lastAgo });
		}
	}

	tick(): void {
		if (!this.def.hasDuration) return;
		const active = this.entries.find(e => e.end === null);
		if (active && this.timerDisplay) {
			const elapsed = Math.round((Date.now() - new Date(active.timestamp).getTime()) / 1000);
			this.timerDisplay.update(elapsed, this.def.displayName);
		}
	}

	getAlerts(entries: SimpleTrackerEntry[], dayStart: Date): HealthAlert[] {
		const alerts: HealthAlert[] = [];
		const cfg = this.def.notificationConfig;
		if (!cfg?.reminderEnabled) return alerts;

		const sorted = [...entries].sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
		const last = sorted.length > 0 ? sorted[sorted.length - 1] : null;

		if (last) {
			const hoursSince = (Date.now() - new Date(last.timestamp).getTime()) / 3600000;
			if (hoursSince >= cfg.reminderIntervalHours) {
				alerts.push({
					level: 'info',
					message: cfg.reminderMessage,
					detail: `Last logged ${timeAgo(last.timestamp)}`,
				});
			}
		} else {
			// No entries at all — fire reminder if it's been at least the interval since midnight
			const hoursSinceMidnight = (Date.now() - dayStart.getTime()) / 3600000;
			if (hoursSinceMidnight >= cfg.reminderIntervalHours) {
				alerts.push({
					level: 'info',
					message: cfg.reminderMessage,
				});
			}
		}

		return alerts;
	}

	destroy(): void {
		this.dismissEditPanel();
	}

	// ── Actions ──

	/** Handle quick-select: log with the primary select field pre-filled. */
	private async onQuickSelectAction(
		fieldKey: string,
		optionValue: string,
		timestamp?: string
	): Promise<void> {
		const fields: Record<string, string | number | boolean> = { [fieldKey]: optionValue };

		// Duration tracker: start timer with the selected option
		if (this.def.hasDuration) {
			const active = this.entries.find(e => e.end === null);
			if (active) {
				await this.stopTimer();
				return;
			}
			// Check for other start-phase fields (excluding the pre-filled one)
			const otherStartFields = this.getFieldsForPhase('start').filter(f => f.key !== fieldKey);
			if (otherStartFields.length > 0) {
				this.showStartForm(timestamp, otherStartFields);
				return;
			}
			await this.startTimer(fields, timestamp);
			return;
		}

		// Non-duration: check if there are other required fields
		const otherRequired = this.def.fields.filter(f => f.key !== fieldKey && f.required);
		if (otherRequired.length > 0) {
			this.showLogForm(timestamp);
			return;
		}

		// One-tap log with the pre-filled field
		const entry: SimpleTrackerEntry = {
			id: generateId(),
			timestamp: timestamp || new Date().toISOString(),
			fields,
			notes: '',
		};

		this.entries.push(entry);
		this.entries.sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
		this.emitEvent?.({ type: 'simple-logged', entry, module: this.id });
		this.refreshUI();
		if (this.save) await this.save();
	}

	/** Get fields for a given collection phase. */
	private getFieldsForPhase(phase: 'start' | 'stop' | 'log'): SimpleTrackerField[] {
		return this.def.fields.filter(f => {
			const collectOn = f.collectOn || (this.def.hasDuration ? 'start' : 'log');
			if (collectOn === 'always') return true;
			return collectOn === phase;
		});
	}

	private async onQuickAction(timestamp?: string): Promise<void> {
		if (!this.def.hasDuration) {
			// Non-duration: if no fields, quick-log. Otherwise show form.
			if (this.def.fields.length === 0) {
				await this.quickLog(timestamp);
			} else {
				this.showLogForm(timestamp);
			}
			return;
		}

		// Duration-based: toggle start/stop
		const active = this.entries.find(e => e.end === null);
		if (active) {
			await this.stopTimer();
			return;
		}

		// Check if there are start-phase fields to collect
		const startFields = this.getFieldsForPhase('start');
		if (startFields.length > 0) {
			this.showStartForm(timestamp, startFields);
		} else {
			await this.startTimer({}, timestamp);
		}
	}

	private showStartForm(timestamp?: string, fieldsToShow?: SimpleTrackerField[]): void {
		this.dismissEditPanel();

		const defFields = fieldsToShow || this.getFieldsForPhase('start');
		const editFields = defFields.map(f => this.defFieldToEditField(f));

		const onSave = async (values: Record<string, string>) => {
			const fields = this.editValuesToFields(values);
			this.dismissEditPanel();
			await this.startTimer(fields, timestamp);
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, `Start ${this.def.displayName.toLowerCase()}`, editFields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, `Start ${this.def.displayName.toLowerCase()}`, editFields, onSave,
				() => this.dismissEditPanel()
			);
		}
	}

	private async startTimer(
		fields: Record<string, string | number | boolean>,
		timestamp?: string
	): Promise<void> {
		const entry: SimpleTrackerEntry = {
			id: generateId(),
			timestamp: timestamp || new Date().toISOString(),
			end: null,
			fields,
			notes: '',
		};

		this.entries.push(entry);
		this.refreshUI();
		if (this.save) await this.save();
	}

	private async stopTimer(): Promise<void> {
		const active = this.entries.find(e => e.end === null);
		if (!active) return;

		active.end = new Date().toISOString();
		active.durationSec = Math.round(
			(new Date(active.end).getTime() - new Date(active.timestamp).getTime()) / 1000
		);

		// Check if there are stop-phase fields to collect
		const stopFields = this.getFieldsForPhase('stop');
		if (stopFields.length > 0) {
			this.showStopForm(active, stopFields);
		} else {
			this.emitEvent?.({ type: 'simple-logged', entry: active, module: this.id });
			this.refreshUI();
			if (this.save) await this.save();
		}
	}

	private showStopForm(entry: SimpleTrackerEntry, fieldsToShow: SimpleTrackerField[]): void {
		this.dismissEditPanel();

		const editFields = fieldsToShow.map(f => this.defFieldToEditField(f, entry.fields[f.key]));

		const onSave = async (values: Record<string, string>) => {
			// Merge stop-phase field values into the entry
			for (const f of fieldsToShow) {
				const raw = values[f.key];
				if (raw !== undefined) {
					entry.fields[f.key] = this.parseFieldValue(f, raw);
				}
			}
			this.emitEvent?.({ type: 'simple-logged', entry, module: this.id });
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, `Finish ${this.def.displayName.toLowerCase()}`, editFields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, `Finish ${this.def.displayName.toLowerCase()}`, editFields, onSave,
				() => {
					this.dismissEditPanel();
					// Still save even if cancelled — timer already stopped
					this.emitEvent?.({ type: 'simple-logged', entry, module: this.id });
					this.refreshUI();
					this.save?.();
				}
			);
		}
	}

	private showLogForm(timestamp?: string): void {
		this.dismissEditPanel();

		const editFields = this.defFieldsToEditFields();

		if (this.def.hasDuration && timestamp) {
			editFields.push({
				key: '_duration',
				label: 'Duration (minutes)',
				type: 'number',
				value: '15',
				min: '1',
				placeholder: '15',
			});
		}

		editFields.push({
			key: '_notes',
			label: 'Notes',
			type: 'text',
			value: '',
			placeholder: 'Optional',
		});

		const onSave = async (values: Record<string, string>) => {
			const fields = this.editValuesToFields(values);
			const notes = values._notes || '';

			const entry: SimpleTrackerEntry = {
				id: generateId(),
				timestamp: timestamp || new Date().toISOString(),
				fields,
				notes,
			};

			if (this.def.hasDuration && values._duration) {
				const durationMin = parseInt(values._duration, 10) || 15;
				entry.durationSec = durationMin * 60;
				entry.end = new Date(
					new Date(entry.timestamp).getTime() + durationMin * 60_000
				).toISOString();
			}

			this.entries.push(entry);
			this.entries.sort(
				(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
			);
			this.emitEvent?.({ type: 'simple-logged', entry, module: this.id });
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, `Log ${this.def.displayName.toLowerCase()}`, editFields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, `Log ${this.def.displayName.toLowerCase()}`, editFields, onSave,
				() => this.dismissEditPanel()
			);
		}
	}

	private async quickLog(timestamp?: string): Promise<void> {
		const entry: SimpleTrackerEntry = {
			id: generateId(),
			timestamp: timestamp || new Date().toISOString(),
			fields: {},
			notes: '',
		};

		this.entries.push(entry);
		this.entries.sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
		this.emitEvent?.({ type: 'simple-logged', entry, module: this.id });
		this.refreshUI();
		if (this.save) await this.save();
	}

	private async editEntry(id: string): Promise<void> {
		const entry = this.entries.find(e => e.id === id);
		if (!entry) return;

		this.dismissEditPanel();

		const editFields: EditField[] = [
			{ key: '_time', label: 'Time', type: 'datetime', value: entry.timestamp },
		];

		for (const f of this.def.fields) {
			const currentVal = entry.fields[f.key];
			editFields.push(this.defFieldToEditField(f, currentVal));
		}

		if (this.def.hasDuration && entry.end) {
			editFields.push({
				key: '_duration',
				label: 'Duration (minutes)',
				type: 'number',
				value: String(Math.round((entry.durationSec || 0) / 60)),
				min: '1',
			});
		}

		editFields.push({
			key: '_notes',
			label: 'Notes',
			type: 'text',
			value: entry.notes || '',
			placeholder: 'Optional',
		});

		const onSave = async (values: Record<string, string>) => {
			entry.timestamp = values._time;
			entry.notes = values._notes || '';

			for (const f of this.def.fields) {
				if (values[f.key] !== undefined) {
					entry.fields[f.key] = this.parseFieldValue(f, values[f.key]);
				}
			}

			if (this.def.hasDuration && values._duration) {
				const durationMin = parseInt(values._duration, 10);
				if (!isNaN(durationMin) && durationMin > 0) {
					entry.durationSec = durationMin * 60;
					entry.end = new Date(
						new Date(entry.timestamp).getTime() + durationMin * 60_000
					).toISOString();
				}
			}

			this.entries.sort(
				(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
			);
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, `Edit ${this.def.displayName.toLowerCase()}`, editFields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, `Edit ${this.def.displayName.toLowerCase()}`, editFields, onSave,
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

	private async deleteEntry(id: string): Promise<void> {
		this.entries = this.entries.filter(e => e.id !== id);
		this.refreshUI();
		if (this.save) await this.save();
	}

	// ── Field conversion helpers ──

	/** Convert a SimpleTrackerField definition to an InlineEditPanel EditField. */
	private defFieldToEditField(
		f: SimpleTrackerField,
		currentValue?: string | number | boolean
	): EditField {
		const strVal = currentValue !== undefined ? String(currentValue) : '';

		switch (f.type) {
			case 'select':
				return {
					key: f.key,
					label: f.label,
					type: 'select',
					value: strVal,
					options: (f.options || []).map(o => ({ value: o, label: o })),
				};
			case 'number':
				return {
					key: f.key,
					label: f.label,
					type: 'number',
					value: strVal,
					min: f.min !== undefined ? String(f.min) : undefined,
					max: f.max !== undefined ? String(f.max) : undefined,
					placeholder: f.placeholder,
					unit: f.unit,
				};
			case 'rating':
				return {
					key: f.key,
					label: f.label,
					type: 'rating',
					value: strVal || String(f.min ?? 1),
					min: String(f.min ?? 1),
					max: String(f.max ?? 5),
				};
			case 'boolean':
				return {
					key: f.key,
					label: f.label,
					type: 'boolean',
					value: currentValue ? 'true' : 'false',
				};
			case 'datetime':
				return {
					key: f.key,
					label: f.label,
					type: 'datetime',
					value: strVal || new Date().toISOString(),
				};
			default: // text
				return {
					key: f.key,
					label: f.label,
					type: 'text',
					value: strVal,
					placeholder: f.placeholder,
				};
		}
	}

	/** Convert all def fields to edit fields with empty defaults. */
	private defFieldsToEditFields(): EditField[] {
		return this.def.fields.map(f => this.defFieldToEditField(f));
	}

	/** Convert edit form string values back to proper typed field values. */
	private editValuesToFields(values: Record<string, string>): Record<string, string | number | boolean> {
		const result: Record<string, string | number | boolean> = {};
		for (const f of this.def.fields) {
			const raw = values[f.key];
			if (raw !== undefined) {
				result[f.key] = this.parseFieldValue(f, raw);
			}
		}
		return result;
	}

	/** Parse a string form value into the proper type for a field. */
	private parseFieldValue(f: SimpleTrackerField, raw: string): string | number | boolean {
		switch (f.type) {
			case 'number':
			case 'rating': {
				const n = parseFloat(raw);
				return isNaN(n) ? 0 : n;
			}
			case 'boolean':
				return raw === 'true';
			default:
				return raw;
		}
	}

	// ── UI Refresh ──

	private refreshUI(): void {
		const active = this.def.hasDuration ? this.entries.find(e => e.end === null) : null;

		// Timer visibility
		if (this.timerSection) {
			if (active) {
				this.timerSection.removeClass('pt-hidden');
				if (this.timerDisplay) {
					this.timerDisplay.setActive(true);
					this.timerDisplay.setLabel(this.def.displayName);
				}
			} else {
				this.timerSection.addClass('pt-hidden');
				if (this.timerDisplay) this.timerDisplay.setActive(false);
			}
		}

		// Stats
		if (this.statsEl) {
			this.statsEl.empty();
			const stats = computeSimpleTrackerStats(this.entries);
			if (stats.todayCount > 0 || stats.lastAgo) {
				if (stats.todayCount > 0) {
					span(this.statsEl, 'pt-simple-stat', `Today: ${stats.todayCount}`);
				}
				if (stats.totalDurationSec > 0) {
					span(this.statsEl, 'pt-simple-stat',
						` \u2022 ${formatDurationShort(stats.totalDurationSec)} total`);
				}
				if (stats.lastAgo) {
					span(this.statsEl, 'pt-simple-stat', ` \u2022 Last: ${stats.lastAgo}`);
				}
			}
		}

		// Entry list
		if (this.entryList) {
			const todayEntries = filterToday(this.entries, e => e.timestamp);
			const items: EntryListItem[] = todayEntries
				.filter(e => e.end !== null || !this.def.hasDuration) // Hide active timer entries
				.map(e => {
					const parts: string[] = [];
					// Show key field values
					for (const f of this.def.fields) {
						const v = e.fields[f.key];
						if (v !== undefined && v !== '' && v !== false) {
							if (f.type === 'rating') {
								parts.push(`${f.label}: ${v}`);
							} else if (f.unit) {
								parts.push(`${v}${f.unit}`);
							} else {
								parts.push(String(v));
							}
						}
					}
					const text = parts.length > 0 ? parts.join(' \u2022 ') : this.def.displayName;
					const subtext = e.durationSec
						? formatDurationShort(e.durationSec)
						: e.notes || undefined;

					return {
						id: e.id,
						time: formatTime(e.timestamp, this.settings?.timeFormat),
						icon: this.def.icon,
						text,
						subtext,
					};
				});
			this.entryList.update(items);
		}
	}

	// ── Event helpers ──

	private addButtonHandler(el: HTMLElement, handler: () => void): void {
		el.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		});
		el.addEventListener('pointerup', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			handler();
		});
		el.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			handler();
		});
	}
}
