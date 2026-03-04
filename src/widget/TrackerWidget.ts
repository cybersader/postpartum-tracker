import { MarkdownRenderChild, MarkdownPostProcessorContext } from 'obsidian';
import type { PostpartumData, PostpartumTrackerSettings, HealthAlert } from '../types';
import type { TrackerModule } from '../trackers/BaseTracker';
import { CodeBlockStore } from '../data/CodeBlockStore';
import { TrackerRegistry } from '../data/TrackerRegistry';
import { getDayStart, getDayEnd, daysSinceBirth } from '../data/dateUtils';
import { CollapsibleSection } from './CollapsibleSection';
import { QuickActions } from './QuickActions';
import { DailySummary, type SummaryCard } from './DailySummary';
import { AlertsPanel } from './AlertsPanel';
import { InlineEditPanel, type EditField } from './shared/InlineEditPanel';
import { deepMerge } from '../utils/deepMerge';
import { evaluateMilestones } from '../trackers/milestoneEvaluator';
import { getLogicPacks } from '../trackers/logicPacks';
import type PostpartumTrackerPlugin from '../main';

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
	private dailySummary!: DailySummary;
	private quickActions!: QuickActions;
	private alertsPanel!: AlertsPanel;
	private sectionsContainer!: HTMLElement;
	private sectionCollapsibles: Map<string, CollapsibleSection> = new Map();

	// State
	private saving = false;
	private babyEditPanel: InlineEditPanel | null = null;

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

	private buildUI(root: HTMLElement): void {
		// 0. Baby info bar (name, day of life, edit)
		this.babyInfoBar = root.createDiv({ cls: 'pt-baby-info-bar' });
		this.babyEditContainer = root.createDiv({ cls: 'pt-edit-panel-container' });
		this.renderBabyInfoBar();

		// 1. Daily summary dashboard
		this.dailySummary = new DailySummary(root);

		// 2. Quick actions area (collected from all modules)
		this.quickActions = new QuickActions(root, this.settings.hapticFeedback);

		// 3. Health alerts
		this.alertsPanel = new AlertsPanel(root);

		// 4. Module sections (collapsible, reorderable)
		this.sectionsContainer = root.createDiv({ cls: 'pt-sections' });

		// Initialize all modules with their data and build UI
		this.initializeModules();
		this.buildSections();
		this.collectQuickActions();
		this.updateDailySummary();
		this.updateAlerts();
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

	/** Build collapsible sections in layout order with move controls. */
	private buildSections(): void {
		this.sectionCollapsibles.clear();
		this.sectionsContainer.empty();

		const activeLayout = this.data.layout.filter(
			id => this.settings.enabledModules.includes(id)
		);

		for (const moduleId of activeLayout) {
			const module = this.registry.get(moduleId);
			if (!module) continue;

			const collapsible = new CollapsibleSection(
				this.sectionsContainer,
				module.displayName,
				moduleId,
				module.defaultExpanded
			);

			// Wire move controls
			collapsible.enableMove(
				() => this.moveSection(moduleId, -1),
				() => this.moveSection(moduleId, 1)
			);
			collapsible.enableDrag((direction) => this.moveSection(moduleId, direction));

			this.sectionCollapsibles.set(moduleId, collapsible);

			// Delegate UI building to the module
			module.buildUI(
				collapsible.getBodyEl(),
				() => this.save(),
				this.settings,
				(event) => this.plugin.emitTrackerEvent(event)
			);
		}

		this.updateMoveButtons();
	}

	/** Collect quick-action buttons from all modules and render them. */
	private collectQuickActions(): void {
		const allActions = [];
		for (const module of this.registry.getAll()) {
			if (!this.settings.enabledModules.includes(module.id)) continue;
			allActions.push(...module.getQuickActions());
		}
		this.quickActions.render(allActions);
	}

	/** Update the daily summary dashboard with stats from all modules. */
	private updateDailySummary(): void {
		const dayStart = getDayStart();
		const dayEnd = getDayEnd();
		const cards: SummaryCard[] = [];

		for (const module of this.registry.getAll()) {
			if (!this.settings.enabledModules.includes(module.id)) continue;
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

	/** Called every 200ms to update live timer displays. No file writes. */
	private tick(): void {
		for (const module of this.registry.getAll()) {
			if (!this.settings.enabledModules.includes(module.id)) continue;
			if (module.tick) module.tick();
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
		const activeLayout = this.data.layout.filter(
			id => this.settings.enabledModules.includes(id)
		);
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

		try {
			await this.store.save(this.ctx, this.containerEl, this.data);
		} catch (e) {
			console.error('Postpartum Tracker: failed to save', e);
		} finally {
			this.saving = false;
		}
	}
}
