import type { App } from 'obsidian';
import type { TrackerModule } from '../BaseTracker';
import type { MedicationEntry, MedicationConfig, PostpartumTrackerSettings, QuickAction, HealthAlert, TrackerEvent } from '../../types';
import { DEFAULT_MEDICATIONS } from '../../types';
import { MedicationStats, computeMedStats, type MedDoseInfo } from './medicationStats';
import { formatTime, generateId } from '../../utils/formatters';
import { div, span } from '../../utils/dom';
import { filterToday, filterRecent } from '../../data/dateUtils';
import { EntryList, type EntryListItem } from '../../widget/shared/EntryList';
import { InlineEditPanel, type EditField } from '../../widget/shared/InlineEditPanel';
import { TrackerEditModal } from '../../ui/TrackerEditModal';

export class MedicationTracker implements TrackerModule<MedicationEntry, MedicationStats> {
	readonly id = 'medication';
	readonly displayName = 'Medication';
	readonly defaultExpanded = true;
	readonly defaultOrder = 2;

	private entries: MedicationEntry[] = [];
	private configs: MedicationConfig[] = [...DEFAULT_MEDICATIONS];
	private save: (() => Promise<void>) | null = null;
	private settings: PostpartumTrackerSettings | null = null;
	private emitEvent: ((event: TrackerEvent) => void) | null = null;
	private app: App | null = null;

	// UI
	private bodyEl: HTMLElement | null = null;
	private editPanelContainer: HTMLElement | null = null;
	private doseTimersEl: HTMLElement | null = null;
	private alternatingEl: HTMLElement | null = null;
	private entryList: EntryList | null = null;
	private riskBarsEl: HTMLElement | null = null;
	private currentEditPanel: InlineEditPanel | null = null;

	parseEntries(raw: unknown): MedicationEntry[] {
		if (!Array.isArray(raw)) return [];
		return raw as MedicationEntry[];
	}

	serializeEntries(): MedicationEntry[] {
		return this.entries;
	}

	emptyEntries(): MedicationEntry[] {
		return [];
	}

	/** Called by TrackerWidget. Also receives medicationConfig from data. */
	update(entries: MedicationEntry[]): void {
		this.entries = entries;
		this.refreshUI();
	}

	/** Set medication configs from the data block. */
	setConfigs(configs: MedicationConfig[]): void {
		this.configs = configs;
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
		if (settings.medication.medications.length > 0) {
			this.configs = settings.medication.medications;
		}

		// Container for edit panels (always at top)
		this.editPanelContainer = bodyEl.createDiv({ cls: 'pt-edit-panel-container' });

		// Alternating schedule display
		this.alternatingEl = bodyEl.createDiv({ cls: 'pt-med-alternating' });

		// Dose timers (time since / until next dose for each med)
		this.doseTimersEl = bodyEl.createDiv({ cls: 'pt-med-dose-timers' });

		// Risk bars
		this.riskBarsEl = bodyEl.createDiv({ cls: 'pt-med-risk-bars' });

		// Entry list
		this.entryList = new EntryList(bodyEl, 'No medications logged today');
		this.entryList.setCallbacks(
			(id) => this.editEntry(id),
			(id) => this.deleteEntry(id)
		);

		this.refreshUI();
	}

	getQuickActions(): QuickAction[] {
		const enabledMeds = this.configs.filter(c => c.enabled);
		const holdForDetails = this.settings?.medication?.buttons?.holdForDetails ?? false;
		return enabledMeds.map(med => ({
			id: `med-${med.name.toLowerCase().replace(/\s+/g, '-')}`,
			label: med.technicalName ? `${med.name}\n${med.technicalName}` : med.name,
			icon: med.icon,
			cls: `pt-quick-btn--med`,
			onClick: (ts) => this.logDose(med.name, med.dosage, ts),
			onLongPress: holdForDetails ? (ts) => this.logDoseWithDetails(med.name, med.dosage, ts) : undefined,
			labelEssential: true,
		}));
	}

	computeStats(entries: MedicationEntry[], dayStart: Date): MedicationStats {
		return computeMedStats(entries, this.configs, dayStart);
	}

	renderSummary(el: HTMLElement, stats: MedicationStats): void {
		const card = el.createDiv({ cls: 'pt-module-summary-card' });
		card.createDiv({ cls: 'pt-module-summary-value', text: String(stats.totalDoses) });
		card.createDiv({ cls: 'pt-module-summary-label', text: 'Meds' });
	}

	tick(): void {
		// Update dose timers every tick (live countdowns)
		this.refreshDoseTimers();
	}

	// ── Actions ──

	/** Long-press: open a notes form before logging the dose. */
	private logDoseWithDetails(name: string, dosage?: string, timestamp?: string): void {
		this.dismissEditPanel();

		const fields: EditField[] = [
			{ key: 'time', label: 'Time', type: 'datetime', value: timestamp || new Date().toISOString() },
			{ key: 'notes', label: 'Notes', type: 'text', value: '', placeholder: 'Taken with food, side effects, etc.' },
		];

		const onSave = async (values: Record<string, string>) => {
			const entry: MedicationEntry = {
				id: generateId(),
				name,
				dosage: dosage || undefined,
				timestamp: values.time,
				notes: values.notes || '',
			};

			this.entries.push(entry);
			this.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			const config = this.configs.find(c => c.name.toLowerCase() === name.toLowerCase());
			this.emitEvent?.({ type: 'medication-logged', entry, config });
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, `Log ${name}`, fields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, `Log ${name}`, fields, onSave,
				() => this.dismissEditPanel()
			);
		}
	}

	private async logDose(name: string, dosage?: string, timestamp?: string): Promise<void> {
		const entry: MedicationEntry = {
			id: generateId(),
			name,
			dosage: dosage || undefined,
			timestamp: timestamp || new Date().toISOString(),
			notes: '',
		};

		this.entries.push(entry);
		// Sort by timestamp
		this.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		// Find matching config for the medication
		const config = this.configs.find(c => c.name.toLowerCase() === name.toLowerCase());
		this.emitEvent?.({ type: 'medication-logged', entry, config });
		this.refreshUI();
		if (this.save) await this.save();
	}

	async editEntry(id: string): Promise<void> {
		const entry = this.entries.find(e => e.id === id);
		if (!entry) return;

		this.dismissEditPanel();

		const medOptions = this.configs
			.filter(c => c.enabled)
			.map(c => ({ value: c.name, label: c.technicalName ? `${c.name} (${c.technicalName})` : c.name }));

		const fields: EditField[] = [
			{ key: 'time', label: 'Time', type: 'datetime', value: entry.timestamp },
			{
				key: 'name', label: 'Medication', type: 'select',
				value: entry.name, options: medOptions,
			},
			{ key: 'notes', label: 'Notes', type: 'text', value: entry.notes || '', placeholder: 'Optional' },
		];

		const onSave = async (values: Record<string, string>) => {
			entry.timestamp = values.time;
			entry.name = values.name;
			const config = this.configs.find(c => c.name === values.name);
			if (config) entry.dosage = config.dosage || undefined;
			entry.notes = values.notes || '';

			this.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, 'Edit medication dose', fields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, 'Edit medication dose', fields, onSave,
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
		this.refreshDoseTimers();
		this.refreshAlternating();
		this.refreshRiskBars();
		this.refreshEntryList();
	}

	private refreshDoseTimers(): void {
		if (!this.doseTimersEl) return;
		this.doseTimersEl.empty();

		const stats = computeMedStats(this.entries, this.configs);

		for (const dose of stats.doses) {
			const row = this.doseTimersEl.createDiv({ cls: 'pt-dose-timer-row' });
			const config = this.configs.find(c => c.name === dose.name);
			const techSuffix = config?.technicalName ? ` (${config.technicalName})` : '';
			row.createSpan({ cls: 'pt-dose-timer-name', text: dose.name + techSuffix });

			if (dose.lastTaken === null) {
				row.createSpan({ cls: 'pt-dose-timer-value', text: 'No doses taken' });
			} else {
				const msSince = dose.msSinceLastDose!;
				const minSince = Math.floor(msSince / 60000);
				const h = Math.floor(minSince / 60);
				const m = minSince % 60;
				const agoStr = h > 0 ? `${h}h ${m}m ago` : `${m}m ago`;

				if (dose.isSafe) {
					row.createSpan({
						cls: 'pt-dose-timer-value pt-dose-timer--safe',
						text: `${agoStr} (safe to take)`,
					});
				} else {
					// Countdown to next safe dose
					const msRemaining = dose.minIntervalMs - msSince;
					const minRemaining = Math.ceil(msRemaining / 60000);
					const rh = Math.floor(minRemaining / 60);
					const rm = minRemaining % 60;
					const waitStr = rh > 0 ? `${rh}h ${rm}m` : `${rm}m`;
					row.createSpan({
						cls: 'pt-dose-timer-value pt-dose-timer--wait',
						text: `${agoStr} (wait ${waitStr})`,
					});
				}
			}
		}
	}

	private refreshAlternating(): void {
		if (!this.alternatingEl) return;
		this.alternatingEl.empty();

		const stats = computeMedStats(this.entries, this.configs);
		if (stats.alternatingSchedule) {
			this.alternatingEl.removeClass('pt-hidden');
			this.alternatingEl.createDiv({
				cls: 'pt-med-alternating-text',
				text: stats.alternatingSchedule,
			});
		} else {
			this.alternatingEl.addClass('pt-hidden');
		}
	}

	private refreshRiskBars(): void {
		if (!this.riskBarsEl) return;
		this.riskBarsEl.empty();

		const stats = computeMedStats(this.entries, this.configs);
		for (const dose of stats.doses) {
			if (dose.maxDailyDoses <= 0 || dose.maxDailyDoses >= 999) continue;

			const row = this.riskBarsEl.createDiv({ cls: 'pt-risk-bar-row' });
			row.createSpan({ cls: 'pt-risk-bar-label', text: dose.name });
			row.createSpan({
				cls: 'pt-risk-bar-count',
				text: `${dose.count}/${dose.maxDailyDoses}`,
			});

			const barOuter = row.createDiv({ cls: 'pt-risk-bar-outer' });
			const barInner = barOuter.createDiv({ cls: 'pt-risk-bar-inner' });
			barInner.style.width = `${dose.riskPct}%`;

			// Color based on risk
			if (dose.riskPct >= 100) {
				barInner.addClass('pt-risk-bar--danger');
			} else if (dose.riskPct >= 75) {
				barInner.addClass('pt-risk-bar--warning');
			} else {
				barInner.addClass('pt-risk-bar--safe');
			}
		}
	}

	private refreshEntryList(): void {
		if (!this.entryList) return;

		const recentEntries = filterRecent(this.entries, e => e.timestamp, this.settings?.entryWindowHours ?? 24);
		const items: EntryListItem[] = recentEntries.map(e => ({
			id: e.id,
			time: formatTime(e.timestamp, this.settings?.timeFormat),
			icon: '\uD83D\uDC8A',
			text: e.name,
			subtext: e.dosage || undefined,
			rawTimestamp: e.timestamp,
		})).reverse();
		this.entryList.update(items);
	}

	addEntry(data: Record<string, unknown>): void {
		const name = (data.name as string) || '';
		const config = this.configs.find(c => c.name.toLowerCase() === name.toLowerCase());

		const entry: MedicationEntry = {
			id: generateId(),
			name: config?.name || name,
			dosage: config?.dosage || (data.dosage as string) || undefined,
			timestamp: (data.timestamp as string) || new Date().toISOString(),
			notes: (data.notes as string) || '',
		};

		this.entries.push(entry);
		this.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		this.emitEvent?.({ type: 'medication-logged', entry, config });
		this.refreshUI();
		this.save?.();
	}
}
