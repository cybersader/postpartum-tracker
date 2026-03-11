import { MarkdownRenderChild, MarkdownPostProcessorContext } from 'obsidian';
import type { PostpartumData, PostpartumTrackerSettings, HealthAlert } from '../types';
import type { TrackerModule } from '../trackers/BaseTracker';
import { CodeBlockStore } from '../data/CodeBlockStore';
import { TrackerRegistry } from '../data/TrackerRegistry';
import { getDayStart, getDayEnd, daysSinceBirth, getDefaultAnalyticsWindow } from '../data/dateUtils';
import { CollapsibleSection } from './CollapsibleSection';
import { QuickActions } from './QuickActions';
import { DailySummary, type SummaryCard } from './DailySummary';
import { AlertsPanel } from './AlertsPanel';
import { EventHistorySection } from './EventHistorySection';
import { QuickEntrySection } from './QuickEntrySection';
import { InlineEditPanel, type EditField } from './shared/InlineEditPanel';
import { deepMerge } from '../utils/deepMerge';
import { evaluateMilestones } from '../trackers/milestoneEvaluator';
import { getLogicPacks } from '../trackers/logicPacks';
import { FeedingAnalytics } from './analytics/FeedingAnalytics';
import { SleepAnalytics } from './analytics/SleepAnalytics';
import { DiaperAnalytics } from './analytics/DiaperAnalytics';
import { MedicationAnalytics } from './analytics/MedicationAnalytics';
import type { FeedingEntry, DiaperEntry, MedicationEntry } from '../types';
import type PostpartumTrackerPlugin from '../main';

function setsEqual(a: Set<string>, b: Set<string>): boolean {
	if (a.size !== b.size) return false;
	for (const v of a) if (!b.has(v)) return false;
	return true;
}

/**
 * The main inline tracker widget rendered inside a postpartum-tracker code block.
 * Extends MarkdownRenderChild for proper lifecycle management.
 */
export class TrackerWidget extends MarkdownRenderChild {
	private plugin: PostpartumTrackerPlugin;
	private data: PostpartumData;
	private ctx: MarkdownPostProcessorContext;
	private store: CodeBlockStore;
	private settings: PostpartumTrackerSettings;
	private registry: TrackerRegistry;

	// UI components
	private babyInfoBar!: HTMLElement;
	private babyEditContainer!: HTMLElement;
	private dailySummary: DailySummary | null = null;
	private quickActions!: QuickActions;
	private alertsPanel!: AlertsPanel;
	private eventHistory: EventHistorySection | null = null;
	private sectionsContainer!: HTMLElement;
	private sectionCollapsibles: Map<string, CollapsibleSection> = new Map();

	// State
	private saving = false;
	private babyEditPanel: InlineEditPanel | null = null;
	private deferredSaveTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		containerEl: HTMLElement,
		plugin: PostpartumTrackerPlugin,
		data: PostpartumData,
		ctx: MarkdownPostProcessorContext
	) {
		super(containerEl);
		this.plugin = plugin;
		this.data = data;
		this.ctx = ctx;
		this.store = new CodeBlockStore(plugin.app);
		this.registry = plugin.registry;
		this.settings = data.settingsOverrides
			? deepMerge(plugin.settings, data.settingsOverrides as Record<string, unknown>)
			: plugin.settings;
	}

	onload(): void {
		this.plugin.registerWidget(this);

		const root = this.containerEl;
		root.empty();
		root.addClass('pt-widget');

		this.buildUI(root);

		// Restore scroll position after a section move
		const scrollTarget = localStorage.getItem('pt-scroll-after-move');
		if (scrollTarget) {
			localStorage.removeItem('pt-scroll-after-move');
			requestAnimationFrame(() => this.scrollToSection(scrollTarget));
		}

		// Start the update loop for live timers
		this.registerInterval(
			window.setInterval(() => this.tick(), 200)
		);
	}

	onunload(): void {
		this.plugin.unregisterWidget(this);
		if (this.deferredSaveTimer) {
			clearTimeout(this.deferredSaveTimer);
			this.deferredSaveTimer = null;
		}
	}

	/**
	 * Refresh the widget in-place: re-read settings and rebuild the entire UI
	 * without rewriting the code block JSON. Called when plugin settings change.
	 */
	refresh(): void {
		// Re-merge settings (global may have changed)
		this.settings = this.data.settingsOverrides
			? deepMerge(this.plugin.settings, this.data.settingsOverrides as Record<string, unknown>)
			: this.plugin.settings;

		const root = this.containerEl;
		root.empty();
		root.addClass('pt-widget');
		this.buildUI(root);
	}

	private buildUI(root: HTMLElement): void {
		const showSummary = this.settings.showSummaryBar;
		const summaryPos = this.settings.summaryPosition || 'top';

		// 0. Baby info bar (name, day of life, edit)
		this.babyInfoBar = root.createDiv({ cls: 'pt-baby-info-bar' });
		this.babyEditContainer = root.createDiv({ cls: 'pt-edit-panel-container' });
		this.renderBabyInfoBar();

		// 1. Daily summary dashboard — position: 'top' means before buttons
		this.dailySummary = null;
		if (showSummary && summaryPos === 'top') {
			this.dailySummary = new DailySummary(root);
		}

		// 2. Quick actions area (collected from all modules)
		const timerColor = this.resolveTimerAnimationColor();
		this.quickActions = new QuickActions(root, this.settings.hapticFeedback, this.settings.showButtonLabels, this.settings.buttonSize, this.settings.buttonColumns, this.settings.timerAnimation, timerColor);

		// Summary after buttons
		if (showSummary && summaryPos === 'after-buttons') {
			this.dailySummary = new DailySummary(root);
		}

		// 3. Health alerts
		this.alertsPanel = new AlertsPanel(root);

		// 3.5. Quick entry (NLP text input)
		if (this.settings.showQuickEntry) {
			const medNames = this.settings.medication.medications
				.filter(m => m.enabled)
				.map(m => m.name);
			new QuickEntrySection(
				root, this.registry, this.settings,
				() => this.save(),
				(event) => this.plugin.emitTrackerEvent(event),
				medNames
			);
		}

		// 4. Module sections (collapsible, reorderable)
		this.sectionsContainer = root.createDiv({ cls: 'pt-sections' });

		// Summary at bottom (after sections — appended after sections are built)
		if (showSummary && summaryPos === 'bottom') {
			this.dailySummary = new DailySummary(root);
		}

		// Event history is now a first-class section inside sectionsContainer (see buildSections)
		this.eventHistory = null;

		// Initialize all modules with their data and build UI
		this.initializeModules();
		this.buildSections();
		this.collectQuickActions();
		this.updateDailySummary();
		this.updateAlerts();
		this.updateEventHistory();
	}

	/** Render the baby info bar at the top of the widget. */
	private renderBabyInfoBar(): void {
		this.babyInfoBar.empty();

		const meta = this.data.meta;
		const hasInfo = meta.babyName || meta.birthDate;

		if (hasInfo) {
			const infoText = this.babyInfoBar.createDiv({ cls: 'pt-baby-info-text' });

			if (meta.babyName) {
				infoText.createSpan({ cls: 'pt-baby-name', text: meta.babyName });
			}

			if (meta.birthDate) {
				const dayOfLife = daysSinceBirth(meta.birthDate);
				if (dayOfLife >= 0) {
					const dayLabel = dayOfLife === 0 ? 'Born today' : `Day ${dayOfLife}`;
					if (meta.babyName) {
						infoText.createSpan({ cls: 'pt-baby-separator', text: ' \u2022 ' });
					}
					infoText.createSpan({ cls: 'pt-baby-day', text: dayLabel });

					// Show weeks + days if older than 7 days
					if (dayOfLife >= 7) {
						const weeks = Math.floor(dayOfLife / 7);
						const days = dayOfLife % 7;
						const weeksLabel = days === 0 ? `${weeks}w` : `${weeks}w ${days}d`;
						infoText.createSpan({ cls: 'pt-baby-weeks', text: ` (${weeksLabel})` });
					}
				}
			}
		} else {
			this.babyInfoBar.createDiv({
				cls: 'pt-baby-info-empty',
				text: 'Tap to set baby name and birth date',
			});
		}

		// Edit button
		const editBtn = this.babyInfoBar.createEl('button', {
			cls: 'pt-baby-info-edit',
			title: 'Edit baby info',
			text: '\u270E',
		});
		editBtn.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		});
		editBtn.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		});
		editBtn.addEventListener('mouseup', (e) => {
			e.stopPropagation();
			e.stopImmediatePropagation();
		});
		editBtn.addEventListener('pointerup', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			this.editBabyInfo();
		});
		editBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		});

		// Also make the whole bar clickable if no info set
		if (!hasInfo) {
			this.babyInfoBar.addEventListener('pointerdown', (e) => {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
			});
			this.babyInfoBar.addEventListener('mousedown', (e) => {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
			});
			this.babyInfoBar.addEventListener('mouseup', (e) => {
				e.stopPropagation();
				e.stopImmediatePropagation();
			});
			this.babyInfoBar.addEventListener('pointerup', (e) => {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				this.editBabyInfo();
			});
			this.babyInfoBar.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
			});
			this.babyInfoBar.style.cursor = 'pointer';
		}
	}

	/** Show inline edit panel for baby name and birth date. */
	private editBabyInfo(): void {
		// Dismiss any existing panel
		if (this.babyEditPanel) {
			this.babyEditPanel.destroy();
			this.babyEditPanel = null;
			return; // Toggle off
		}

		const meta = this.data.meta;
		const fields: EditField[] = [
			{
				key: 'name', label: 'Baby name', type: 'text',
				value: meta.babyName || '', placeholder: 'Enter name',
			},
			{
				key: 'birthDate', label: 'Birth date', type: 'date',
				value: meta.birthDate || new Date().toISOString().split('T')[0],
			},
		];

		this.babyEditPanel = new InlineEditPanel(
			this.babyEditContainer,
			'Baby info',
			fields,
			async (values) => {
				meta.babyName = values.name.trim() || undefined;
				const parsed = new Date(values.birthDate);
				if (!isNaN(parsed.getTime())) {
					meta.birthDate = values.birthDate;
				}
				this.babyEditPanel?.destroy();
				this.babyEditPanel = null;
				this.renderBabyInfoBar();
				await this.save();
			},
			() => {
				this.babyEditPanel?.destroy();
				this.babyEditPanel = null;
			}
		);
	}

	/** Initialize each module with its entries from the data. */
	private initializeModules(): void {
		for (const module of this.registry.getAll()) {
			if (!this.settings.enabledModules.includes(module.id)) continue;
			const rawEntries = this.data.trackers[module.id];
			const entries = module.parseEntries(rawEntries);
			module.update(entries);
		}
	}

	private static readonly HISTORY_ID = 'event-history';
	private static readonly ANALYTICS_IDS: Record<string, string> = {
		'feeding-analytics': 'Feeding analytics',
		'sleep-analytics': 'Sleep analytics',
		'diaper-analytics': 'Diaper analytics',
		'medication-analytics': 'Medication analytics',
	};

	/** Build collapsible sections in layout order with move controls. */
	private buildSections(): void {
		this.sectionCollapsibles.clear();
		this.sectionsContainer.empty();

		// Ensure all enabled modules are in the layout (append missing ones)
		for (const id of this.settings.enabledModules) {
			if (!this.data.layout.includes(id) && this.registry.get(id)) {
				this.data.layout.push(id);
			}
		}

		// Ensure event-history is in the layout if enabled
		if (this.settings.showEventHistory && !this.data.layout.includes(TrackerWidget.HISTORY_ID)) {
			this.data.layout.push(TrackerWidget.HISTORY_ID);
		}

		// Ensure enabled analytics sections are in the layout
		const enabledAnalytics = this.settings.enabledAnalytics || [];
		for (const aId of enabledAnalytics) {
			if (!this.data.layout.includes(aId)) {
				this.data.layout.push(aId);
			}
		}

		const activeLayout = this.data.layout.filter(id => {
			if (id === TrackerWidget.HISTORY_ID) return this.settings.showEventHistory;
			if (id in TrackerWidget.ANALYTICS_IDS) return enabledAnalytics.includes(id);
			return this.settings.enabledModules.includes(id);
		});

		for (const itemId of activeLayout) {
			// Analytics sections
			if (itemId in TrackerWidget.ANALYTICS_IDS) {
				this.buildAnalyticsSection(itemId);
				continue;
			}

			// Event history — first-class moveable section
			if (itemId === TrackerWidget.HISTORY_ID) {
				const collapsible = new CollapsibleSection(
					this.sectionsContainer,
					'Recent activity',
					TrackerWidget.HISTORY_ID,
					true
				);
				collapsible.enableMove(
					() => this.moveSection(TrackerWidget.HISTORY_ID, -1),
					() => this.moveSection(TrackerWidget.HISTORY_ID, 1)
				);
				collapsible.enableDrag((dir) => this.moveSection(TrackerWidget.HISTORY_ID, dir));
				this.sectionCollapsibles.set(TrackerWidget.HISTORY_ID, collapsible);

				this.eventHistory = new EventHistorySection(
					collapsible.getBodyEl(), this.registry, this.settings, () => this.save(), this.plugin.app
				);
				continue;
			}

			// Regular tracker module section
			const module = this.registry.get(itemId);
			if (!module) continue;

			const collapsible = new CollapsibleSection(
				this.sectionsContainer,
				module.displayName,
				itemId,
				module.defaultExpanded
			);

			// Wire move controls
			collapsible.enableMove(
				() => this.moveSection(itemId, -1),
				() => this.moveSection(itemId, 1)
			);
			collapsible.enableDrag((direction) => this.moveSection(itemId, direction));

			this.sectionCollapsibles.set(itemId, collapsible);

			// Delegate UI building to the module
			module.buildUI(
				collapsible.getBodyEl(),
				() => this.save(),
				this.settings,
				(event) => this.plugin.emitTrackerEvent(event),
				this.plugin.app
			);
		}

		this.updateMoveButtons();
	}

	/** Resolve timer animation color from preset to hex, or null for accent. */
	private resolveTimerAnimationColor(): string | null {
		const preset = this.settings.timerAnimationColor;
		switch (preset) {
			case 'red':    return '#ef4444';
			case 'green':  return '#22c55e';
			case 'blue':   return '#3b82f6';
			case 'custom': return this.settings.timerAnimationCustomColor || '#ff4444';
			default:       return null; // 'accent' — use CSS var
		}
	}

	/** Collect quick-action buttons from all modules and render them. */
	private collectQuickActions(): void {
		const allActions = [];
		for (const module of this.registry.getAll()) {
			if (!this.settings.enabledModules.includes(module.id)) continue;
			const actions = module.getQuickActions();
			// Wrap onClick to auto-expand the module's section (skip scroll in modal mode)
			for (const action of actions) {
				const originalOnClick = action.onClick;
				action.onClick = (ts) => {
					originalOnClick(ts);
					if (this.settings.inputMode !== 'modal') {
						this.scrollToSection(module.id);
					}
				};
			}
			allActions.push(...actions);
		}
		this.quickActions.render(allActions);
	}

	/** Update the daily summary dashboard with stats from all modules. */
	private updateDailySummary(): void {
		if (!this.dailySummary) return;

		const dayStart = getDayStart();
		const dayEnd = getDayEnd();
		const cards: SummaryCard[] = [];

		// Only show modules the user explicitly opted in to
		const allowedModules = this.settings.visibleSummaryModules || [];
		if (allowedModules.length === 0) {
			this.dailySummary.render([]);
			return;
		}

		// Determine module iteration order: summaryOrder first, then remaining allowed
		const summaryOrder = this.settings.summaryOrder;
		const orderedIds: string[] = [];
		if (summaryOrder.length > 0) {
			for (const id of summaryOrder) {
				if (allowedModules.includes(id)) orderedIds.push(id);
			}
			for (const id of allowedModules) {
				if (!orderedIds.includes(id)) orderedIds.push(id);
			}
		} else {
			orderedIds.push(...allowedModules);
		}

		const visibleIds = orderedIds;

		for (const moduleId of visibleIds) {
			const module = this.registry.get(moduleId);
			if (!module) continue;
			const rawEntries = this.data.trackers[module.id];
			const entries = module.parseEntries(rawEntries);
			const stats = module.computeStats(entries, dayStart, dayEnd);

			// Collect summary cards by rendering to a temp element
			const tempEl = document.createElement('div');
			module.renderSummary(tempEl, stats);
			// Read card data from the rendered elements
			const cardEls = tempEl.querySelectorAll('.pt-module-summary-card');
			cardEls.forEach(cardEl => {
				const value = cardEl.querySelector('.pt-module-summary-value')?.textContent || '';
				const label = cardEl.querySelector('.pt-module-summary-label')?.textContent || '';
				const sublabel = cardEl.querySelector('.pt-module-summary-sublabel')?.textContent;
				cards.push({ value, label, sublabel: sublabel || undefined });
			});
		}

		// Logic pack milestone progress cards
		if (this.data.meta.birthDate) {
			const dol = daysSinceBirth(this.data.meta.birthDate);
			if (dol >= 0) {
				const packIds = this.data.logicPackId
					? [this.data.logicPackId]
					: this.settings.activeLogicPacks;
				const packs = getLogicPacks(packIds);
				if (packs.length > 0) {
					const statuses = evaluateMilestones(this.data, packs, dol);
					const met = statuses.filter(s => s.met).length;
					const total = statuses.length;
					if (total > 0) {
						cards.push({
							value: `${met}/${total}`,
							label: 'Milestones',
							sublabel: met === total ? 'All on track' : `${total - met} need attention`,
						});
					}
				}
			}
		}

		this.dailySummary.render(cards);
	}

	/** Collect and display health alerts from all modules + logic packs. */
	private updateAlerts(): void {
		const dayStart = getDayStart();
		const allAlerts: HealthAlert[] = [];

		for (const module of this.registry.getAll()) {
			if (!this.settings.enabledModules.includes(module.id)) continue;
			if (!module.getAlerts) continue;
			const rawEntries = this.data.trackers[module.id];
			const entries = module.parseEntries(rawEntries);
			allAlerts.push(...module.getAlerts(entries, dayStart, this.data.meta.birthDate));
		}

		// Logic pack milestone alerts
		if (this.data.meta.birthDate) {
			const dol = daysSinceBirth(this.data.meta.birthDate);
			if (dol >= 0) {
				const packIds = this.data.logicPackId
					? [this.data.logicPackId]
					: this.settings.activeLogicPacks;
				const packs = getLogicPacks(packIds);
				if (packs.length > 0) {
					const statuses = evaluateMilestones(this.data, packs, dol);
					for (const s of statuses) {
						if (s.met) continue; // Only show unmet milestones as alerts
						allAlerts.push({
							level: s.rule.alertLevel,
							message: s.message,
							detail: typeof s.actual === 'number'
								? `Current: ${s.actual}${s.rule.expect.min !== undefined ? ` / ${s.rule.expect.min} expected` : ''}`
								: undefined,
						});
					}
				}
			}
		}

		this.alertsPanel.render(allAlerts);
	}

	/** Refresh the event history feed. */
	private updateEventHistory(): void {
		if (this.eventHistory) this.eventHistory.refresh();
	}

	/** Resolve the effective analytics window (days) for a given module. */
	private getAnalyticsWindow(analyticsId: string): number {
		const perModule = this.data.analyticsWindows?.[analyticsId];
		if (perModule) return perModule;
		if (this.settings.analyticsWindowDays) return this.settings.analyticsWindowDays;
		return getDefaultAnalyticsWindow(this.data.meta.birthDate);
	}

	/** Build an analytics collapsible section with inline window picker. */
	private buildAnalyticsSection(analyticsId: string): void {
		const title = TrackerWidget.ANALYTICS_IDS[analyticsId] || analyticsId;
		const collapsible = new CollapsibleSection(
			this.sectionsContainer, title, analyticsId, false,
		);
		collapsible.enableMove(
			() => this.moveSection(analyticsId, -1),
			() => this.moveSection(analyticsId, 1),
		);
		collapsible.enableDrag((dir) => this.moveSection(analyticsId, dir));
		this.sectionCollapsibles.set(analyticsId, collapsible);

		const body = collapsible.getBodyEl();
		const currentWindow = this.getAnalyticsWindow(analyticsId);

		// Inline window picker pills
		const pickerRow = body.createDiv({ cls: 'pt-analytics-window-picker' });
		const windowOptions: [number, string][] = [
			[3, '3d'], [7, '1w'], [14, '2w'], [30, '1mo'], [90, '3mo'],
		];
		for (const [days, label] of windowOptions) {
			const pill = pickerRow.createEl('button', {
				cls: `pt-window-pill${days === currentWindow ? ' pt-window-pill--active' : ''}`,
				text: label,
			});
			this.addPillHandler(pill, () => {
				this.setAnalyticsWindow(analyticsId, days, body, pickerRow);
			});
		}

		// Content container (re-rendered on window change without full rebuild)
		const contentEl = body.createDiv({ cls: 'pt-analytics-content' });
		this.renderAnalyticsContent(analyticsId, contentEl, currentWindow);
	}

	/** Render analytics charts into a container. Called on build and on window change. */
	private renderAnalyticsContent(analyticsId: string, container: HTMLElement, days: number): void {
		switch (analyticsId) {
			case 'feeding-analytics': {
				const entries = (this.data.trackers.feeding || []) as FeedingEntry[];
				const analytics = new FeedingAnalytics(container);
				analytics.render(entries, this.settings, days);
				break;
			}
			case 'sleep-analytics': {
				const entries = (this.data.trackers['sleep'] || []) as any[];
				const analytics = new SleepAnalytics(container);
				analytics.render(entries, this.settings, days);
				break;
			}
			case 'diaper-analytics': {
				const entries = (this.data.trackers.diaper || []) as DiaperEntry[];
				const analytics = new DiaperAnalytics(container);
				analytics.render(entries, this.settings, days, this.data.meta.birthDate);
				break;
			}
			case 'medication-analytics': {
				const entries = (this.data.trackers.medication || []) as MedicationEntry[];
				const configs = (this.data.trackers.medicationConfig || this.settings.medication.medications) as any[];
				const analytics = new MedicationAnalytics(container);
				analytics.render(entries, configs, this.settings, days);
				break;
			}
		}
	}

	/** Handle window pill tap: update in memory, re-render content, deferred save. */
	private setAnalyticsWindow(analyticsId: string, days: number, body: HTMLElement, pickerRow: HTMLElement): void {
		if (!this.data.analyticsWindows) this.data.analyticsWindows = {};
		this.data.analyticsWindows[analyticsId] = days;

		// Update pill active states
		const pills = pickerRow.querySelectorAll('.pt-window-pill');
		pills.forEach(pill => {
			pill.removeClass('pt-window-pill--active');
		});
		// Find the pill matching this day count by its text content mapping
		const windowOptions: [number, string][] = [
			[3, '3d'], [7, '1w'], [14, '2w'], [30, '1mo'], [90, '3mo'],
		];
		const targetLabel = windowOptions.find(([d]) => d === days)?.[1];
		pills.forEach(pill => {
			if ((pill as HTMLElement).textContent === targetLabel) {
				pill.addClass('pt-window-pill--active');
			}
		});

		// Re-render just the content area
		const contentEl = body.querySelector('.pt-analytics-content') as HTMLElement;
		if (contentEl) {
			contentEl.empty();
			this.renderAnalyticsContent(analyticsId, contentEl, days);
		}

		// Deferred save (2s debounce) to persist without scroll jumps
		if (this.deferredSaveTimer) clearTimeout(this.deferredSaveTimer);
		this.deferredSaveTimer = setTimeout(() => {
			this.deferredSaveTimer = null;
			this.save();
		}, 2000);
	}

	/** Add pointerdown/pointerup handler for a pill button (CodeMirror-safe). */
	private addPillHandler(el: HTMLElement, handler: () => void): void {
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
		});
	}

	/** Called every 200ms to update live timer displays. No file writes. */
	private previousActiveIds: Set<string> = new Set();

	private tick(): void {
		const currentActiveIds = new Set<string>();
		for (const module of this.registry.getAll()) {
			if (!this.settings.enabledModules.includes(module.id)) continue;
			if (module.tick) module.tick();
			if (module.getActiveActionIds) {
				for (const id of module.getActiveActionIds()) currentActiveIds.add(id);
			}
		}
		// Update button highlight states only when they change
		if (!setsEqual(this.previousActiveIds, currentActiveIds)) {
			for (const id of this.previousActiveIds) {
				if (!currentActiveIds.has(id)) this.quickActions.setActive(id, false);
			}
			for (const id of currentActiveIds) {
				if (!this.previousActiveIds.has(id)) this.quickActions.setActive(id, true);
			}
			this.previousActiveIds = currentActiveIds;
		}
	}

	/** Move a section up or down in the layout. */
	private async moveSection(sectionId: string, direction: -1 | 1): Promise<void> {
		const layout = this.data.layout;
		const idx = layout.indexOf(sectionId);
		const newIdx = idx + direction;
		if (idx < 0 || newIdx < 0 || newIdx >= layout.length) return;

		[layout[idx], layout[newIdx]] = [layout[newIdx], layout[idx]];

		const container = this.sectionsContainer;
		const el = this.sectionCollapsibles.get(sectionId)?.getEl();
		const otherEl = this.sectionCollapsibles.get(layout[idx])?.getEl();
		if (el && otherEl) {
			if (direction === -1) {
				container.insertBefore(el, otherEl);
			} else {
				container.insertBefore(otherEl, el);
			}
		}

		this.updateMoveButtons();
		localStorage.setItem('pt-scroll-after-move', sectionId);
		await this.save();
	}

	/** Update which move arrows are enabled based on position. */
	private updateMoveButtons(): void {
		const enabledAnalytics = this.settings.enabledAnalytics || [];
		const activeLayout = this.data.layout.filter(id => {
			if (id === TrackerWidget.HISTORY_ID) return this.settings.showEventHistory;
			if (id in TrackerWidget.ANALYTICS_IDS) return enabledAnalytics.includes(id);
			return this.settings.enabledModules.includes(id);
		});
		for (let i = 0; i < activeLayout.length; i++) {
			const collapsible = this.sectionCollapsibles.get(activeLayout[i]);
			if (collapsible) {
				collapsible.setMoveEnabled(i > 0, i < activeLayout.length - 1);
			}
		}
	}

	/** Scroll to and expand a collapsible section. */
	private scrollToSection(sectionId: string): void {
		const collapsible = this.sectionCollapsibles.get(sectionId);
		if (!collapsible) return;
		collapsible.expand();
		collapsible.getEl().scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	/** Save data to the code block. Triggers re-render. */
	async save(): Promise<void> {
		if (this.saving) return;
		this.saving = true;

		// Collect serialized entries from all modules
		for (const module of this.registry.getAll()) {
			this.data.trackers[module.id] = module.serializeEntries();
		}

		// Preserve scroll position across save/re-render to prevent jumps
		const scroller = this.containerEl.closest('.cm-scroller') || this.containerEl.closest('.markdown-preview-view');
		const scrollTop = scroller?.scrollTop ?? null;

		try {
			await this.store.save(this.ctx, this.containerEl, this.data);
		} catch (e) {
			console.error('Postpartum Tracker: failed to save', e);
		} finally {
			this.saving = false;
		}

		// Restore scroll position after Obsidian re-renders the code block
		if (scroller && scrollTop !== null) {
			requestAnimationFrame(() => {
				scroller.scrollTop = scrollTop;
			});
		}
	}
}
