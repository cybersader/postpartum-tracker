import type { App } from 'obsidian';
import type { TrackerModule } from '../BaseTracker';
import type { FeedingEntry, PostpartumTrackerSettings, QuickAction, HealthAlert, TrackerEvent } from '../../types';
import { FeedingStats, computeFeedingStats, getActiveElapsed } from './feedingStats';
import { formatDuration, formatTime, formatDurationShort, generateId } from '../../utils/formatters';
import { div, span } from '../../utils/dom';
import { filterToday, filterRecent, timeAgo } from '../../data/dateUtils';
import { EntryList, type EntryListItem } from '../../widget/shared/EntryList';
import { TimerDisplay } from '../../widget/shared/TimerDisplay';
import { InlineEditPanel, type EditField } from '../../widget/shared/InlineEditPanel';
import { TrackerEditModal } from '../../ui/TrackerEditModal';

export class FeedingTracker implements TrackerModule<FeedingEntry, FeedingStats> {
	readonly id = 'feeding';
	readonly displayName = 'Feeding';
	readonly defaultExpanded = true;
	readonly defaultOrder = 0;

	private entries: FeedingEntry[] = [];
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

	parseEntries(raw: unknown): FeedingEntry[] {
		if (!Array.isArray(raw)) return [];
		return raw as FeedingEntry[];
	}

	serializeEntries(): FeedingEntry[] {
		return this.entries;
	}

	emptyEntries(): FeedingEntry[] {
		return [];
	}

	update(entries: FeedingEntry[]): void {
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

		// Timer section (visible when feeding is active)
		this.timerSection = bodyEl.createDiv({ cls: 'pt-feeding-timer-section pt-hidden' });
		this.timerDisplay = new TimerDisplay(this.timerSection);
		this.stopBtn = this.timerSection.createEl('button', {
			cls: 'pt-big-button pt-btn-stop',
			text: 'Stop feeding',
		});
		this.stopBtn.addEventListener('click', () => this.stopFeeding());

		// Stats line
		this.statsEl = bodyEl.createDiv({ cls: 'pt-feeding-stats' });

		// Entry list
		this.entryList = new EntryList(bodyEl, 'No feedings today');
		this.entryList.setCallbacks(
			(id) => this.editEntry(id),
			(id) => this.deleteEntry(id)
		);

		this.refreshUI();
	}

	getQuickActions(): QuickAction[] {
		return [
			{
				id: 'feeding-left',
				label: 'Left',
				icon: 'L',
				cls: 'pt-quick-btn--feeding-left',
				onClick: (ts) => this.startFeeding('left', ts),
			},
			{
				id: 'feeding-right',
				label: 'Right',
				icon: 'R',
				cls: 'pt-quick-btn--feeding-right',
				onClick: (ts) => this.startFeeding('right', ts),
			},
			{
				id: 'feeding-both',
				label: 'Both',
				icon: 'B',
				cls: 'pt-quick-btn--feeding-both',
				onClick: (ts) => this.startFeeding('both', ts),
			},
			{
				id: 'feeding-bottle',
				label: 'Bottle',
				icon: '\uD83C\uDF7C',
				cls: 'pt-quick-btn--feeding-bottle',
				onClick: (ts) => this.logBottle(ts),
			},
		];
	}

	getActiveActionIds(): string[] {
		const active = this.entries.find(e => e.end === null);
		if (!active) return [];
		const sideMap: Record<string, string> = { left: 'feeding-left', right: 'feeding-right', both: 'feeding-both' };
		return active.side ? [sideMap[active.side] || 'feeding-both'] : ['feeding-both'];
	}

	computeStats(entries: FeedingEntry[], dayStart: Date): FeedingStats {
		return computeFeedingStats(entries, dayStart);
	}

	renderSummary(el: HTMLElement, stats: FeedingStats): void {
		const card = el.createDiv({ cls: 'pt-module-summary-card' });
		card.createDiv({ cls: 'pt-module-summary-value', text: String(stats.totalFeedings) });
		card.createDiv({ cls: 'pt-module-summary-label', text: 'Feedings' });
		const parts: string[] = [];
		if (stats.totalDurationMin > 0) parts.push(`${stats.totalDurationMin}m nursing`);
		if (stats.bottleCount > 0) {
			const vol = stats.totalBottleMl > 0 ? ` (${stats.totalBottleMl}ml)` : '';
			parts.push(`${stats.bottleCount} bottle${stats.bottleCount > 1 ? 's' : ''}${vol}`);
		}
		if (parts.length > 0) {
			card.createDiv({ cls: 'pt-module-summary-sublabel', text: parts.join(' \u2022 ') });
		}
	}

	tick(): void {
		const active = this.entries.find(e => e.end === null);
		if (active && this.timerDisplay) {
			const elapsed = getActiveElapsed(active);
			this.timerDisplay.update(elapsed, `Feeding (${active.side || 'breast'})`);
		}
	}

	getAlerts(entries: FeedingEntry[], dayStart: Date): HealthAlert[] {
		const alerts: HealthAlert[] = [];
		const completed = filterToday(entries, e => e.start, dayStart).filter(e => e.end !== null);

		// Check time since last feeding
		if (completed.length > 0) {
			const last = completed[completed.length - 1];
			if (last.end) {
				const hoursSince = (Date.now() - new Date(last.end).getTime()) / 3600000;
				if (hoursSince > 3) {
					alerts.push({
						level: 'warning',
						message: `Last feeding was ${Math.round(hoursSince)}h ago`,
						detail: 'Newborns should feed every 2-3 hours.',
					});
				}
			}
		} else {
			// No feedings today
			const hoursSinceMidnight = (Date.now() - dayStart.getTime()) / 3600000;
			if (hoursSinceMidnight > 4) {
				alerts.push({
					level: 'warning',
					message: 'No feedings logged today',
				});
			}
		}

		return alerts;
	}

	// ── Actions ──

	private async startFeeding(side: 'left' | 'right' | 'both', timestamp?: string): Promise<void> {
		// If a past timestamp is provided, show panel for completed entry
		if (timestamp) {
			this.showPastFeedingPanel(side, timestamp);
			return;
		}

		const active = this.entries.find(e => e.end === null);

		// Same side tap → just stop the feeding (toggle off)
		if (active && active.side === side) {
			await this.stopFeeding();
			return;
		}

		// Different side → stop current and start new (side switch)
		if (active) {
			active.end = new Date().toISOString();
			active.durationSec = Math.round(
				(new Date(active.end).getTime() - new Date(active.start).getTime()) / 1000
			);
		}

		const entry: FeedingEntry = {
			id: generateId(),
			type: 'breast',
			side,
			start: new Date().toISOString(),
			end: null,
			notes: '',
		};

		this.entries.push(entry);
		this.refreshUI();
		if (this.save) await this.save();
	}

	/** Show panel for logging a past feeding with duration. */
	private showPastFeedingPanel(side: 'left' | 'right' | 'both', timestamp: string): void {
		this.dismissEditPanel();

		const fields: EditField[] = [
			{ key: 'time', label: 'Start time', type: 'datetime', value: timestamp },
			{ key: 'duration', label: 'Duration (minutes)', type: 'number', value: '15', min: '1', placeholder: '15' },
			{
				key: 'side', label: 'Side', type: 'select', value: side,
				options: [
					{ value: 'left', label: 'Left' },
					{ value: 'right', label: 'Right' },
					{ value: 'both', label: 'Both' },
				],
			},
			{ key: 'notes', label: 'Notes', type: 'text', value: '', placeholder: 'Optional' },
		];

		const onSave = async (values: Record<string, string>) => {
			const durationMin = parseInt(values.duration, 10) || 15;
			const startTime = values.time;
			const endTime = new Date(new Date(startTime).getTime() + durationMin * 60_000).toISOString();

			const entry: FeedingEntry = {
				id: generateId(),
				type: 'breast',
				side: (values.side as 'left' | 'right' | 'both') || side,
				start: startTime,
				end: endTime,
				durationSec: durationMin * 60,
				notes: values.notes || '',
			};

			this.entries.push(entry);
			this.entries.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
			this.emitEvent?.({ type: 'feeding-logged', entry });
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, 'Log past feeding', fields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, 'Log past feeding', fields, onSave,
				() => this.dismissEditPanel()
			);
		}
	}

	private async stopFeeding(): Promise<void> {
		const active = this.entries.find(e => e.end === null);
		if (!active) return;

		active.end = new Date().toISOString();
		active.durationSec = Math.round(
			(new Date(active.end).getTime() - new Date(active.start).getTime()) / 1000
		);

		this.emitEvent?.({ type: 'feeding-logged', entry: active });
		this.refreshUI();
		if (this.save) await this.save();
	}

	private logBottle(timestamp?: string): void {
		this.dismissEditPanel();

		const fields: EditField[] = [
			{ key: 'time', label: 'Time', type: 'datetime', value: timestamp || new Date().toISOString() },
			{ key: 'volumeMl', label: 'Amount', type: 'number', value: '', min: '0', placeholder: '120', unit: 'ml' },
			{ key: 'notes', label: 'Notes', type: 'text', value: '', placeholder: 'Formula, breast milk, etc.' },
		];

		const onSave = async (values: Record<string, string>) => {
			const entry: FeedingEntry = {
				id: generateId(),
				type: 'bottle',
				start: values.time,
				end: values.time,
				durationSec: 0,
				volumeMl: parseInt(values.volumeMl, 10) || undefined,
				notes: values.notes || '',
			};

			this.entries.push(entry);
			this.entries.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
			this.emitEvent?.({ type: 'feeding-logged', entry });
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, 'Log bottle feeding', fields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, 'Log bottle feeding', fields, onSave,
				() => this.dismissEditPanel()
			);
		}
	}

	private async editEntry(id: string): Promise<void> {
		const entry = this.entries.find(e => e.id === id);
		if (!entry) return;

		this.dismissEditPanel();

		const fields: EditField[] = [
			{ key: 'time', label: entry.type === 'bottle' ? 'Time' : 'Start time', type: 'datetime', value: entry.start },
		];

		if (entry.type === 'bottle') {
			fields.push({
				key: 'volumeMl', label: 'Amount', type: 'number',
				value: entry.volumeMl ? String(entry.volumeMl) : '', min: '0', placeholder: '120', unit: 'ml',
			});
		} else if (entry.end !== null) {
			fields.push({
				key: 'side', label: 'Side', type: 'select', value: entry.side || 'left',
				options: [
					{ value: 'left', label: 'Left' },
					{ value: 'right', label: 'Right' },
					{ value: 'both', label: 'Both' },
				],
			});
			fields.push({
				key: 'duration', label: 'Duration (minutes)', type: 'number',
				value: String(Math.round((entry.durationSec || 0) / 60)), min: '1',
			});
		}

		fields.push({
			key: 'notes', label: 'Notes', type: 'text',
			value: entry.notes || '', placeholder: 'Optional',
		});

		const onSave = async (values: Record<string, string>) => {
			entry.start = values.time;
			if (values.volumeMl !== undefined) {
				entry.volumeMl = parseInt(values.volumeMl, 10) || undefined;
			}
			if (values.side) entry.side = values.side as 'left' | 'right' | 'both';
			if (values.duration && entry.end !== null) {
				const durationMin = parseInt(values.duration, 10);
				if (!isNaN(durationMin) && durationMin > 0) {
					entry.durationSec = durationMin * 60;
					entry.end = new Date(
						new Date(entry.start).getTime() + durationMin * 60_000
					).toISOString();
				}
			}
			entry.notes = values.notes || '';

			this.entries.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
			this.dismissEditPanel();
			this.refreshUI();
			if (this.save) await this.save();
		};

		if (this.settings?.inputMode === 'modal' && this.app) {
			new TrackerEditModal(this.app, 'Edit feeding', fields, onSave).open();
		} else {
			if (!this.editPanelContainer) return;
			this.currentEditPanel = new InlineEditPanel(
				this.editPanelContainer, 'Edit feeding', fields, onSave,
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

	// ── UI Refresh ──

	private refreshUI(): void {
		const active = this.entries.find(e => e.end === null);

		// Timer visibility
		if (this.timerSection) {
			if (active) {
				this.timerSection.removeClass('pt-hidden');
				if (this.timerDisplay) {
					this.timerDisplay.setActive(true);
					this.timerDisplay.setLabel(`Feeding (${active.side || 'breast'})`);
				}
			} else {
				this.timerSection.addClass('pt-hidden');
				if (this.timerDisplay) this.timerDisplay.setActive(false);
			}
		}

		// Stats
		if (this.statsEl) {
			this.statsEl.empty();
			const stats = computeFeedingStats(this.entries);
			if (stats.lastFeedingAgo) {
				span(this.statsEl, 'pt-feeding-stat', `Last: ${stats.lastFeedingAgo}`);
				if (stats.lastSide) {
					span(this.statsEl, 'pt-feeding-stat', ` (${stats.lastSide})`);
				}
			}
			if (stats.totalFeedings > 0) {
				span(this.statsEl, 'pt-feeding-stat',
					` \u2022 Today: ${stats.totalFeedings} feedings, ${stats.totalDurationMin}m`
				);
			}
		}

		// Entry list (rolling window so recent entries stay visible after midnight)
		if (this.entryList) {
			const recentEntries = filterRecent(this.entries, e => e.start, this.settings?.entryWindowHours ?? 24);
			const items: EntryListItem[] = recentEntries
				.filter(e => e.end !== null)
				.map(e => {
					if (e.type === 'bottle') {
						const vol = e.volumeMl ? `${e.volumeMl}ml` : '';
						return {
							id: e.id,
							time: formatTime(e.start, this.settings?.timeFormat),
							icon: '\uD83C\uDF7C',
							text: 'Bottle' + (vol ? ` ${vol}` : ''),
							subtext: e.notes || undefined,
							cls: 'pt-entry--feeding-bottle',
						};
					}
					return {
						id: e.id,
						time: formatTime(e.start, this.settings?.timeFormat),
						icon: e.side === 'left' ? 'L' : e.side === 'right' ? 'R' : 'B',
						text: `${e.side || 'breast'}`,
						subtext: e.durationSec ? formatDurationShort(e.durationSec) : '',
						cls: `pt-entry--feeding-${e.side || 'breast'}`,
					};
				});
			this.entryList.update(items);
		}
	}
}
