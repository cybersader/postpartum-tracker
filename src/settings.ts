import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type PostpartumTrackerPlugin from './main';
import type { NotificationType, TrackerCategory, LibraryTrackerOverride, TimerAnimation } from './types';
import { TRACKER_LIBRARY, TRACKER_CATEGORIES, BUILTIN_MODULE_IDS } from './trackers/library';
import { LOGIC_PACKS } from './trackers/logicPacks';
import { EmojiPickerModal } from './ui/EmojiPickerModal';

/**
 * Plugin settings tab with 3 tabs: Trackers, Notifications, General.
 */
export class PostpartumTrackerSettingsTab extends PluginSettingTab {
	plugin: PostpartumTrackerPlugin;
	private activeTabIndex = 0;

	constructor(app: App, plugin: PostpartumTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Tab bar ──
		const tabBar = containerEl.createDiv({ cls: 'pt-settings-tabs' });
		const tabNames = ['Trackers', 'Notifications', 'General'];
		const tabButtons: HTMLElement[] = [];
		const tabBodies: HTMLElement[] = [];

		for (let i = 0; i < tabNames.length; i++) {
			const btn = tabBar.createEl('button', { cls: 'pt-settings-tab', text: tabNames[i] });
			const body = containerEl.createDiv({ cls: 'pt-settings-tab-body' });
			body.style.display = 'none';
			tabButtons.push(btn);
			tabBodies.push(body);

			btn.addEventListener('click', () => {
				this.activeTabIndex = i;
				tabButtons.forEach(b => b.removeClass('is-active'));
				btn.addClass('is-active');
				tabBodies.forEach(b => b.style.display = 'none');
				body.style.display = '';
			});
		}

		// Build each tab
		this.buildTrackersTab(tabBodies[0]);
		this.buildNotificationsTab(tabBodies[1]);
		this.buildGeneralTab(tabBodies[2]);

		// Restore active tab (or default to first)
		const idx = Math.min(this.activeTabIndex, tabNames.length - 1);
		tabBodies[idx].style.display = '';
		tabButtons[idx].addClass('is-active');
	}

	// ═══════════════════════════════════════════════════════════════
	//  Tab 1: Trackers
	// ═══════════════════════════════════════════════════════════════

	private buildTrackersTab(el: HTMLElement): void {
		// --- Logic Packs ---
		new Setting(el).setName('Logic packs').setHeading();
		new Setting(el)
			.setDesc('Logic packs define expected milestones by day of life (diaper counts, feeding frequency, stool transitions, recovery goals). Alerts appear when actual data deviates from expectations.');

		const activePacks = this.plugin.settings.activeLogicPacks;

		for (const pack of LOGIC_PACKS) {
			const isActive = activePacks.includes(pack.id);
			const targetBadge = pack.target === 'baby' ? ' [baby]' : pack.target === 'mother' ? ' [mother]' : ' [both]';
			new Setting(el)
				.setName(`${pack.displayName}${targetBadge}`)
				.setDesc(pack.description)
				.addToggle(toggle => toggle
					.setValue(isActive)
					.onChange(async (value) => {
						if (value && !activePacks.includes(pack.id)) {
							activePacks.push(pack.id);
						} else if (!value) {
							const idx = activePacks.indexOf(pack.id);
							if (idx >= 0) activePacks.splice(idx, 1);
						}
						await this.plugin.saveSettings();
					})
				);
		}

		// --- Tracker Library with search + filter ---
		new Setting(el).setName('Tracker library').setHeading();
		new Setting(el)
			.setDesc('Enable or disable tracking modules. Core modules have deep notification and Todoist integration. Smart modules support automatic reminders.');

		const enabledModules = this.plugin.settings.enabledModules;
		const allCategories: TrackerCategory[] = ['baby-care', 'baby-development', 'mother-recovery', 'general'];

		// Search bar
		const searchRow = el.createDiv({ cls: 'pt-lib-search' });
		const searchInput = searchRow.createEl('input', {
			cls: 'pt-lib-search-input',
			attr: { type: 'text', placeholder: 'Search trackers...' },
		});

		// Category filter chips
		const chipRow = el.createDiv({ cls: 'pt-lib-chips' });
		let activeFilter: TrackerCategory | 'all' = 'all';
		const chipAll = chipRow.createEl('button', { cls: 'pt-lib-chip is-active', text: 'All' });
		const chipButtons: HTMLElement[] = [chipAll];
		for (const cat of allCategories) {
			const meta = TRACKER_CATEGORIES[cat];
			const chip = chipRow.createEl('button', { cls: 'pt-lib-chip', text: meta.label });
			chip.dataset.category = cat;
			chipButtons.push(chip);
		}

		// Results container
		const listContainer = el.createDiv({ cls: 'pt-lib-list' });

		// Collect module IDs referenced by active logic packs for badge display
		const packModuleIds = new Set<string>();
		for (const pack of LOGIC_PACKS) {
			for (const rule of pack.milestones) {
				packModuleIds.add(rule.moduleId);
			}
		}

		// Build a unified tracker list (core + library + custom)
		type TrackerItem = {
			id: string;
			displayName: string;
			icon: string;
			description: string;
			category: TrackerCategory;
			badges: string[];
			isCore: boolean;
			isCustom: boolean;
			isSmart: boolean;
		};

		const allTrackers: TrackerItem[] = [];

		// Core modules
		for (const id of BUILTIN_MODULE_IDS) {
			const module = this.plugin.registry.get(id);
			if (!module) continue;
			const badges: string[] = ['core'];
			if (packModuleIds.has(id)) badges.push('logic pack');
			allTrackers.push({
				id,
				displayName: module.displayName,
				icon: '',
				description: 'Core module with built-in notifications and Todoist integration.',
				category: 'baby-care',
				badges,
				isCore: true,
				isCustom: false,
				isSmart: false,
			});
		}

		// Library modules
		for (const def of TRACKER_LIBRARY) {
			const badges: string[] = [];
			if (def.isSmart) badges.push('smart');
			if (def.hasDuration) badges.push('duration');
			if (packModuleIds.has(def.id)) badges.push('logic pack');
			allTrackers.push({
				id: def.id,
				displayName: def.displayName,
				icon: def.icon,
				description: def.description,
				category: def.category,
				badges,
				isCore: false,
				isCustom: false,
				isSmart: def.isSmart ?? false,
			});
		}

		// Custom trackers
		for (const def of this.plugin.settings.customTrackers) {
			const badges: string[] = ['custom'];
			if (def.hasDuration) badges.push('duration');
			allTrackers.push({
				id: def.id,
				displayName: def.displayName,
				icon: def.icon,
				description: def.description,
				category: def.category,
				badges,
				isCore: false,
				isCustom: true,
				isSmart: false,
			});
		}

		const renderTrackerList = () => {
			listContainer.empty();
			const query = searchInput.value.toLowerCase();

			// Filter
			const filtered = allTrackers.filter(t => {
				if (activeFilter !== 'all' && t.category !== activeFilter) return false;
				if (query) {
					return t.displayName.toLowerCase().includes(query) ||
						t.description.toLowerCase().includes(query) ||
						t.category.toLowerCase().includes(query);
				}
				return true;
			});

			// Group by category
			const grouped = new Map<TrackerCategory, TrackerItem[]>();
			for (const t of filtered) {
				const list = grouped.get(t.category) || [];
				list.push(t);
				grouped.set(t.category, list);
			}

			if (filtered.length === 0) {
				listContainer.createDiv({ cls: 'pt-lib-empty', text: 'No trackers match your search.' });
				return;
			}

			for (const cat of allCategories) {
				const items = grouped.get(cat);
				if (!items || items.length === 0) continue;

				const catMeta = TRACKER_CATEGORIES[cat];
				new Setting(listContainer)
					.setName(catMeta.label)
					.setDesc(catMeta.description)
					.setHeading();

				for (const t of items) {
					const badgeStr = t.badges.map(b => `\u00A0\u00A0[${b}]`).join('');
					const namePrefix = t.icon ? `${t.icon} ` : '';
					const setting = new Setting(listContainer)
						.setName(`${namePrefix}${t.displayName}${badgeStr}`)
						.setDesc(t.description)
						.addToggle(toggle => toggle
							.setValue(enabledModules.includes(t.id))
							.onChange(async (value) => {
								if (value && !enabledModules.includes(t.id)) {
									enabledModules.push(t.id);
								} else if (!value) {
									const idx = enabledModules.indexOf(t.id);
									if (idx >= 0) enabledModules.splice(idx, 1);
								}
								await this.plugin.saveSettings();
								await this.plugin.rebuildRegistry();
							})
						);

					// Add edit button for library (non-core) trackers
					if (!t.isCore) {
						const settingItemEl = listContainer.lastElementChild as HTMLElement;
						setting.addExtraButton(btn => btn
							.setIcon('pencil')
							.setTooltip('Configure')
							.onClick(() => {
								if (t.isCustom) {
									this.showCustomTrackerEditor(settingItemEl, t.id);
								} else {
									this.showTrackerEditor(settingItemEl, t.id);
								}
							})
						);
					}

					// Add delete button for custom trackers
					if (t.isCustom) {
						setting.addExtraButton(btn => btn
							.setIcon('trash')
							.setTooltip('Delete custom tracker')
							.onClick(async () => {
								const customs = this.plugin.settings.customTrackers;
								const idx = customs.findIndex(c => c.id === t.id);
								if (idx >= 0) customs.splice(idx, 1);
								// Remove from enabled modules
								const eIdx = enabledModules.indexOf(t.id);
								if (eIdx >= 0) enabledModules.splice(eIdx, 1);
								await this.plugin.saveSettings();
								await this.plugin.rebuildRegistry();
								renderTrackerList();
							})
						);
					}
				}
			}
		};

		// Wire up search
		searchInput.addEventListener('input', renderTrackerList);

		// Wire up chips
		for (const chip of chipButtons) {
			chip.addEventListener('click', () => {
				chipButtons.forEach(c => c.removeClass('is-active'));
				chip.addClass('is-active');
				activeFilter = (chip.dataset.category as TrackerCategory) || 'all';
				renderTrackerList();
			});
		}

		// Initial render
		renderTrackerList();

		// Create custom tracker button
		new Setting(el)
			.setName('Custom trackers')
			.setDesc('Create your own tracker with custom fields, icons, and categories.')
			.setHeading();

		const createBtnSetting = new Setting(el)
			.addButton(btn => btn
				.setButtonText('Create custom tracker')
				.setCta()
				.onClick(() => {
					// Get the setting-item element as the anchor for the editor
					const anchorEl = createBtnSetting.settingEl;
					this.createCustomTracker(anchorEl, renderTrackerList);
				})
			);

		// --- Feeding ---
		new Setting(el).setName('Feeding').setHeading();

		new Setting(el)
			.setName('Show live timer')
			.setDesc('Display a running timer during active feedings.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.feeding.showTimer)
				.onChange(async (value) => {
					this.plugin.settings.feeding.showTimer = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Track breast side')
			.setDesc('Show left/right/both buttons for breastfeeding.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.feeding.trackSide)
				.onChange(async (value) => {
					this.plugin.settings.feeding.trackSide = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Show bottle button')
			.setDesc('Show the bottle feeding quick-action button.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.feeding.showBottle)
				.onChange(async (value) => {
					this.plugin.settings.feeding.showBottle = value;
					await this.plugin.saveSettings();
				})
			);

		// --- Diapers ---
		new Setting(el).setName('Diapers').setHeading();

		new Setting(el)
			.setName('Show color picker')
			.setDesc('Show stool color selection after logging dirty diapers.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.diaper.showColorPicker)
				.onChange(async (value) => {
					this.plugin.settings.diaper.showColorPicker = value;
					await this.plugin.saveSettings();
				})
			);

		// --- Medication ---
		new Setting(el).setName('Medication').setHeading();

		const meds = this.plugin.settings.medication.medications;
		const medications = meds.map((m, i) => ({ med: m, idx: i })).filter(x => (x.med.category || 'medication') === 'medication');
		const remedies = meds.map((m, i) => ({ med: m, idx: i })).filter(x => x.med.category === 'remedy');

		const renderMedItem = (parentEl: HTMLElement, med: typeof meds[0], i: number) => {
			const techLabel = med.technicalName ? ` (${med.technicalName})` : '';
			const intervalDesc = med.minIntervalHours > 0 ? `Every ${med.minIntervalHours}h` : 'As needed';
			const maxDesc = med.maxDailyDoses > 0 ? `Max ${med.maxDailyDoses}/day` : '';
			const desc = [med.dosage || 'No dosage', intervalDesc, maxDesc].filter(Boolean).join(' \u2022 ');

			const medSetting = new Setting(parentEl)
				.setName(`${med.icon} ${med.name}${techLabel}`)
				.setDesc(desc);

			const settingItemEl = parentEl.lastElementChild as HTMLElement;

			medSetting.addToggle(toggle => toggle
				.setValue(med.enabled)
				.onChange(async (value) => {
					meds[i].enabled = value;
					await this.plugin.saveSettings();
				})
			);

			medSetting.addExtraButton(btn => btn
				.setIcon('pencil')
				.setTooltip('Edit')
				.onClick(() => {
					this.showMedEditor(settingItemEl, i);
				})
			);

			medSetting.addExtraButton(btn => btn
				.setIcon('copy')
				.setTooltip('Duplicate')
				.onClick(async () => {
					meds.splice(i + 1, 0, { ...med, name: med.name + ' (copy)', enabled: true });
					await this.plugin.saveSettings();
					this.display();
				})
			);

			medSetting.addExtraButton(btn => btn
				.setIcon('trash')
				.setTooltip('Delete')
				.onClick(async () => {
					meds.splice(i, 1);
					await this.plugin.saveSettings();
					this.display();
				})
			);
		};

		for (const { med, idx } of medications) renderMedItem(el, med, idx);

		new Setting(el)
			.addButton(btn => btn
				.setButtonText('Add medication')
				.onClick(async () => {
					meds.push({
						name: 'New medication',
						technicalName: '',
						dosage: '',
						minIntervalHours: 6,
						maxDailyDoses: 4,
						enabled: true,
						icon: '\uD83D\uDC8A',
						category: 'medication',
					});
					await this.plugin.saveSettings();
					this.display();
				})
			);

		// --- Recovery Care ---
		new Setting(el).setName('Recovery care').setHeading();
		new Setting(el)
			.setDesc('Topical remedies, sprays, and perineal care products. Toggle items on to track when you last used them.');

		for (const { med, idx } of remedies) renderMedItem(el, med, idx);

		new Setting(el)
			.addButton(btn => btn
				.setButtonText('Add remedy')
				.onClick(async () => {
					meds.push({
						name: 'New remedy',
						technicalName: '',
						dosage: '',
						minIntervalHours: 4,
						maxDailyDoses: 0,
						enabled: true,
						icon: '\uD83E\uDDF4',
						category: 'remedy',
					});
					await this.plugin.saveSettings();
					this.display();
				})
			);
	}

	// ═══════════════════════════════════════════════════════════════
	//  Tab 2: Notifications
	// ═══════════════════════════════════════════════════════════════

	private buildNotificationsTab(el: HTMLElement): void {
		const notif = this.plugin.settings.notifications;

		// ── How notifications work (collapsible guide) ──
		new Setting(el).setName('How notifications work').setHeading();

		const howItWorks = el.createDiv({ cls: 'pt-webhook-guide' });
		howItWorks.createEl('p', {
			text: 'This plugin sends alerts through multiple channels simultaneously. Enable the ones that suit your setup.',
		});

		const table = howItWorks.createEl('table', { cls: 'pt-platform-table' });
		const thead = table.createEl('thead');
		const headRow = thead.createEl('tr');
		for (const h of ['Feature', 'Desktop', 'Android', 'iOS']) {
			headRow.createEl('th', { text: h });
		}
		const tbody = table.createEl('tbody');

		// Section: While Obsidian is open
		const openHeader = tbody.createEl('tr', { cls: 'pt-table-section-header' });
		const openTh = openHeader.createEl('td', { text: 'While Obsidian is open', attr: { colspan: '4' } });
		openTh.style.fontWeight = 'bold';
		openTh.style.paddingTop = '8px';
		const openRows = [
			['In-app toast', 'Yes', 'Yes', 'Yes'],
			['System notification', 'Yes', 'No*', 'No*'],
			['ntfy push', 'Yes', 'Yes', 'Yes'],
			['ntfy alarm (loops until dismiss)', 'n/a', 'Yes', 'No'],
			['ntfy bypass DND', 'n/a', 'Yes', 'No'],
			['Pushover push', 'Yes', 'Yes', 'Yes'],
			['Pushover alarm (retry until ack)', 'n/a', 'Yes', 'Yes'],
			['Pushover bypass DND (Critical)', 'n/a', 'Yes', 'Yes'],
			['Todoist task + reminder', 'Yes', 'Yes', 'Yes'],
		];
		for (const row of openRows) {
			const tr = tbody.createEl('tr');
			for (const cell of row) tr.createEl('td', { text: cell });
		}

		// Section: Obsidian in background
		const bgHeader = tbody.createEl('tr', { cls: 'pt-table-section-header' });
		const bgTh = bgHeader.createEl('td', { text: 'Obsidian in background', attr: { colspan: '4' } });
		bgTh.style.fontWeight = 'bold';
		bgTh.style.paddingTop = '8px';
		const bgRows = [
			['In-app toast', 'No', 'No', 'No'],
			['ntfy scheduled reminder', 'Yes', 'Yes', 'Yes'],
			['Pushover scheduled reminder', 'Maybe\u2020', 'Maybe\u2020', 'Maybe\u2020'],
			['Todoist reminder', 'Yes', 'Yes', 'Yes'],
		];
		for (const row of bgRows) {
			const tr = tbody.createEl('tr');
			for (const cell of row) tr.createEl('td', { text: cell });
		}

		// Section: Obsidian closed
		const closedHeader = tbody.createEl('tr', { cls: 'pt-table-section-header' });
		const closedTh = closedHeader.createEl('td', { text: 'Obsidian fully closed', attr: { colspan: '4' } });
		closedTh.style.fontWeight = 'bold';
		closedTh.style.paddingTop = '8px';
		const closedRows = [
			['ntfy scheduled reminder', 'Yes', 'Yes', 'Yes'],
			['Pushover scheduled reminder', 'No', 'No', 'No'],
			['Todoist reminder', 'Yes', 'Yes', 'Yes'],
		];
		for (const row of closedRows) {
			const tr = tbody.createEl('tr');
			for (const cell of row) tr.createEl('td', { text: cell });
		}

		howItWorks.createEl('p', {
			cls: 'pt-webhook-guide-note',
			text: '* Mobile uses Capacitor which blocks the Web Notification API.',
		});
		howItWorks.createEl('p', {
			cls: 'pt-webhook-guide-note',
			text: '\u2020 Pushover reminders use in-process timers \u2014 they fire if Obsidian stays alive in background, but the OS may kill it.',
		});
		howItWorks.createEl('p', {
			cls: 'pt-webhook-guide-note',
			text: 'ntfy scheduled reminders are stored server-side and arrive regardless of Obsidian state. Todoist tasks sync independently.',
		});
		howItWorks.createEl('p', {
			cls: 'pt-webhook-guide-note pt-webhook-guide-warning',
			text: 'iOS alarm gap: ntfy can schedule notifications server-side (works after closing Obsidian), but iOS limits ntfy to a single alert — no looping alarm. Pushover can loop alarms on iOS via Critical Alerts, but only fires while Obsidian is running. No current service combines both: scheduled offline delivery AND alarm-loop on iOS. For overnight medication reminders on iOS, keep Obsidian open with Pushover enabled, or set a separate phone alarm as backup.',
		});
		howItWorks.createEl('p', {
			cls: 'pt-webhook-guide-note',
			text: 'Android does not have this limitation — ntfy supports both scheduled delivery and alarm-loop with DND bypass.',
		});

		// ── Alert settings ──
		new Setting(el).setName('Alert settings').setHeading();

		new Setting(el)
			.setName('Enable notifications')
			.setDesc('Show alerts for feeding times, medication doses, and more.')
			.addToggle(toggle => toggle
				.setValue(notif.enabled)
				.onChange(async (value) => {
					notif.enabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Notification type')
			.setDesc('In-app works everywhere. System uses OS notifications (desktop only).')
			.addDropdown(dd => dd
				.addOption('in-app', 'In-app toast')
				.addOption('system', 'System (desktop)')
				.addOption('both', 'Both')
				.setValue(notif.type)
				.onChange(async (value) => {
					notif.type = value as NotificationType;
					await this.plugin.saveSettings();
					if ((value === 'system' || value === 'both') &&
						'Notification' in window &&
						Notification.permission === 'default') {
						Notification.requestPermission();
					}
				})
			);

		new Setting(el)
			.setName('Check interval (minutes)')
			.setDesc('How often to check for new alerts while Obsidian is open.')
			.addText(text => text
				.setValue(String(notif.checkIntervalMin))
				.setPlaceholder('1')
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num >= 0.5) {
						notif.checkIntervalMin = num;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(el)
			.setName('Feeding reminder')
			.setDesc('Alert when time since last feeding exceeds the threshold. Interval adjusts by age: 2h (days 0-7), 2.5h (days 8-28), 3h (day 29+).')
			.addToggle(toggle => toggle
				.setValue(notif.feedingReminderEnabled)
				.onChange(async (value) => {
					notif.feedingReminderEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		if (notif.feedingReminderEnabled) {
			new Setting(el)
				.setName('Custom interval override (hours)')
				.setDesc('Leave empty to use the age-based schedule above.')
				.addText(text => text
					.setValue(notif.feedingReminderOverride > 0 ? String(notif.feedingReminderOverride) : '')
					.setPlaceholder('Auto')
					.onChange(async (value) => {
						const trimmed = value.trim();
						if (trimmed === '' || trimmed === '0') {
							notif.feedingReminderOverride = 0;
						} else {
							const num = parseFloat(trimmed);
							if (!isNaN(num) && num > 0) {
								notif.feedingReminderOverride = num;
							}
						}
						await this.plugin.saveSettings();
					})
				);
		}

		new Setting(el)
			.setName('Medication dose ready')
			.setDesc('Alert when a medication dose becomes safe to take.')
			.addToggle(toggle => toggle
				.setValue(notif.medDoseReadyEnabled)
				.onChange(async (value) => {
					notif.medDoseReadyEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Alternating medication schedule')
			.setDesc('Alert for Tylenol/Ibuprofen alternating schedule.')
			.addToggle(toggle => toggle
				.setValue(notif.medAlternatingEnabled)
				.onChange(async (value) => {
					notif.medAlternatingEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		// ── Push Notifications (webhook) ──
		new Setting(el).setName('Push notifications').setHeading();

		new Setting(el)
			.setName('Enable push notifications')
			.setDesc('Get alerts on your phone via ntfy.sh, Pushover, Gotify, or a custom webhook.')
			.addToggle(toggle => toggle
				.setValue(notif.webhookEnabled)
				.onChange(async (value) => {
					notif.webhookEnabled = value;
					await this.plugin.saveSettings();
					this.display();
				})
			);

		if (notif.webhookEnabled) {
			// Migration: if user had old single-preset model, auto-enable the matching service
			if (!notif.ntfyEnabled && !notif.pushoverEnabled && !notif.gotifyEnabled && !notif.customWebhookEnabled) {
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
				this.plugin.saveSettings();
			}

			el.createEl('p', {
				cls: 'pt-webhook-guide-note',
				text: 'Enable one or more services below. When sharing a vault, each person can enable the service they prefer \u2014 both will receive notifications simultaneously.',
			});

			// ═══════════════════════════════════════════════
			//  ntfy.sh
			// ═══════════════════════════════════════════════
			new Setting(el).setName('ntfy.sh (free, Android alarms)').setHeading();

			new Setting(el)
				.setName('Enable ntfy')
				.setDesc('Free, open-source push notifications. Best alarm support on Android.')
				.addToggle(toggle => toggle
					.setValue(notif.ntfyEnabled)
					.onChange(async (value) => {
						notif.ntfyEnabled = value;
						await this.plugin.saveSettings();
						this.display();
					})
				);

			if (notif.ntfyEnabled) {
				if (!notif.ntfyTopic) {
					notif.ntfyTopic = 'pptracker-' + Math.random().toString(36).slice(2, 10);
					this.plugin.saveSettings();
				}

				new Setting(el)
					.setName('Topic name')
					.setDesc('A unique topic name. Keep this private \u2014 anyone with it can see your notifications.')
					.addText(text => text
						.setValue(notif.ntfyTopic)
						.setPlaceholder('pptracker-abc123')
						.onChange(async (value) => {
							notif.ntfyTopic = value.trim();
							await this.plugin.saveSettings();
						})
					);

				// ntfy setup guide
				const guideEl = el.createDiv({ cls: 'pt-webhook-guide' });

				const basicSteps = guideEl.createEl('ol', { cls: 'pt-webhook-guide-steps' });
				basicSteps.createEl('li', { text: 'Install ntfy app (iOS App Store / Google Play)' });
				basicSteps.createEl('li', { text: `Subscribe to topic: ${notif.ntfyTopic}` });
				basicSteps.createEl('li', { text: 'Tap "Send test" below to verify' });

				guideEl.createEl('p', { cls: 'pt-webhook-guide-title', text: 'Android alarm setup' });
				const alarmSteps = guideEl.createEl('ol', { cls: 'pt-webhook-guide-steps' });
				alarmSteps.createEl('li', { text: 'Long-press subscription \u2192 Notification settings' });
				alarmSteps.createEl('li', { text: 'Enable "Keep alerting" for max priority' });
				alarmSteps.createEl('li', { text: 'Enable "Override Do Not Disturb"' });
				alarmSteps.createEl('li', { text: 'Set an alarm sound for max priority channel' });

				guideEl.createEl('p', {
					cls: 'pt-webhook-guide-note',
					text: 'iOS: ntfy delivers time-sensitive alerts but cannot loop sound. For alarm-loop on iOS, enable Pushover below.',
				});
				guideEl.createEl('p', {
					cls: 'pt-webhook-guide-note',
					text: 'Scheduled reminders are stored on the ntfy server and arrive even after closing Obsidian.',
				});

				new Setting(el)
					.setName('Schedule reminders on log')
					.setDesc('Immediately schedule a future push notification when you log an entry. Works even after closing Obsidian.')
					.addToggle(toggle => toggle
						.setValue(notif.scheduleNtfyOnLog)
						.onChange(async (value) => {
							notif.scheduleNtfyOnLog = value;
							await this.plugin.saveSettings();
						})
					);

				// ntfy test button
				if (notif.ntfyTopic) {
					new Setting(el)
						.setName('Test ntfy')
						.addButton(btn => btn
							.setButtonText('Send test')
							.onClick(async () => {
								try {
									const resp = await fetch(`https://ntfy.sh/${notif.ntfyTopic}`, {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({
											title: 'Postpartum Tracker',
											message: 'Test notification \u2014 ntfy is working!',
											priority: 3,
											tags: ['white_check_mark'],
											topic: notif.ntfyTopic,
										}),
									});
									if (resp.ok) new Notice('ntfy test sent! Check your phone.');
									else new Notice(`ntfy test failed: ${resp.status} ${await resp.text()}`);
								} catch (e) {
									new Notice(`Error: ${(e as Error).message}`);
								}
							})
						);
				}
			}

			// ═══════════════════════════════════════════════
			//  Pushover
			// ═══════════════════════════════════════════════
			new Setting(el).setName('Pushover (iOS + Android alarms, $5 one-time)').setHeading();

			new Setting(el)
				.setName('Enable Pushover')
				.setDesc('Alarm-style notifications on iOS and Android. Emergency priority retries until acknowledged.')
				.addToggle(toggle => toggle
					.setValue(notif.pushoverEnabled)
					.onChange(async (value) => {
						notif.pushoverEnabled = value;
						await this.plugin.saveSettings();
						this.display();
					})
				);

			if (notif.pushoverEnabled) {
				new Setting(el)
					.setName('App API token')
					.setDesc('From pushover.net/apps \u2014 create an application to get a token.')
					.addText(text => text
						.setValue(notif.pushoverAppToken)
						.setPlaceholder('azGDORePK8gMaC0QOYAMyEEuzJnyUi')
						.onChange(async (value) => {
							notif.pushoverAppToken = value.trim();
							await this.plugin.saveSettings();
						})
					);

				new Setting(el)
					.setName('User key')
					.setDesc('From your Pushover dashboard (pushover.net) \u2014 the "Your User Key" value.')
					.addText(text => text
						.setValue(notif.pushoverUserKey)
						.setPlaceholder('uQiRzpo4DXghDmr9QzzfQu27cmVRsG')
						.onChange(async (value) => {
							notif.pushoverUserKey = value.trim();
							await this.plugin.saveSettings();
						})
					);

				const pushGuide = el.createDiv({ cls: 'pt-webhook-guide' });

				pushGuide.createEl('p', { cls: 'pt-webhook-guide-title', text: 'Setup instructions:' });
				const pushSteps = pushGuide.createEl('ol', { cls: 'pt-webhook-guide-steps' });
				pushSteps.createEl('li', { text: 'Install the Pushover app on your phone (iOS App Store / Google Play).' });
				pushSteps.createEl('li', { text: 'Create an account at pushover.net \u2014 copy your User Key from the dashboard.' });
				pushSteps.createEl('li', { text: 'Go to pushover.net/apps and create a new application \u2014 copy the API Token.' });
				pushSteps.createEl('li', { text: 'Paste both values above, then tap "Send test" to verify.' });

				pushGuide.createEl('p', { cls: 'pt-webhook-guide-title', text: 'iOS: Enable Critical Alerts (alarm that bypasses silent/DND)' });
				const iosSteps = pushGuide.createEl('ol', { cls: 'pt-webhook-guide-steps' });
				iosSteps.createEl('li', { text: 'In the Pushover iOS app, go to Settings.' });
				iosSteps.createEl('li', { text: 'Enable "Critical Alerts" \u2014 plays sound even on silent mode and bypasses Do Not Disturb.' });
				iosSteps.createEl('li', { text: 'Urgent alerts use emergency priority \u2014 they repeat every 60 seconds until you tap "Acknowledge".' });

				pushGuide.createEl('p', { cls: 'pt-webhook-guide-title', text: 'Android: Alarm behavior' });
				pushGuide.createEl('p', {
					cls: 'pt-webhook-guide-note',
					text: 'Emergency-priority notifications also loop until acknowledged on Android. Customize sound and DND override in Android notification settings for Pushover.',
				});

				pushGuide.createEl('p', { cls: 'pt-webhook-guide-title', text: 'Pricing and offline' });
				pushGuide.createEl('p', {
					cls: 'pt-webhook-guide-note',
					text: '$4.99 one-time (not subscription), 7,500 messages/month free. Pushover has no server-side delay \u2014 scheduled reminders only fire while Obsidian is open. For offline, pair with Todoist or ntfy.',
				});

				// Pushover test button
				if (notif.pushoverAppToken && notif.pushoverUserKey) {
					new Setting(el)
						.setName('Test Pushover')
						.addButton(btn => btn
							.setButtonText('Send test')
							.onClick(async () => {
								try {
									const resp = await fetch('https://api.pushover.net/1/messages.json', {
										method: 'POST',
										body: new URLSearchParams({
											token: notif.pushoverAppToken,
											user: notif.pushoverUserKey,
											title: 'Postpartum Tracker',
											message: 'Test notification \u2014 Pushover is working!',
											priority: '0',
										}),
									});
									if (resp.ok) new Notice('Pushover test sent! Check your phone.');
									else new Notice(`Pushover test failed: ${resp.status} ${await resp.text()}`);
								} catch (e) {
									new Notice(`Error: ${(e as Error).message}`);
								}
							})
						);
				}
			}

			// ═══════════════════════════════════════════════
			//  Gotify
			// ═══════════════════════════════════════════════
			new Setting(el).setName('Gotify (self-hosted)').setHeading();

			new Setting(el)
				.setName('Enable Gotify')
				.setDesc('Self-hosted push notification server.')
				.addToggle(toggle => toggle
					.setValue(notif.gotifyEnabled)
					.onChange(async (value) => {
						notif.gotifyEnabled = value;
						await this.plugin.saveSettings();
						this.display();
					})
				);

			if (notif.gotifyEnabled) {
				new Setting(el)
					.setName('Gotify server URL')
					.setDesc('Your Gotify server URL with app token (e.g., https://gotify.example.com/message?token=...).')
					.addText(text => text
						.setValue(notif.gotifyUrl)
						.setPlaceholder('https://gotify.example.com/message?token=...')
						.onChange(async (value) => {
							notif.gotifyUrl = value.trim();
							await this.plugin.saveSettings();
						})
					);

				if (notif.gotifyUrl) {
					new Setting(el)
						.setName('Test Gotify')
						.addButton(btn => btn
							.setButtonText('Send test')
							.onClick(async () => {
								try {
									const resp = await fetch(notif.gotifyUrl, {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({
											title: 'Postpartum Tracker',
											message: 'Test notification \u2014 Gotify is working!',
											priority: 3,
										}),
									});
									if (resp.ok) new Notice('Gotify test sent!');
									else new Notice(`Gotify test failed: ${resp.status} ${await resp.text()}`);
								} catch (e) {
									new Notice(`Error: ${(e as Error).message}`);
								}
							})
						);
				}
			}

			// ═══════════════════════════════════════════════
			//  Custom webhook
			// ═══════════════════════════════════════════════
			new Setting(el).setName('Custom webhook').setHeading();

			new Setting(el)
				.setName('Enable custom webhook')
				.setDesc('POST JSON to any URL when an alert fires.')
				.addToggle(toggle => toggle
					.setValue(notif.customWebhookEnabled)
					.onChange(async (value) => {
						notif.customWebhookEnabled = value;
						await this.plugin.saveSettings();
						this.display();
					})
				);

			if (notif.customWebhookEnabled) {
				new Setting(el)
					.setName('Webhook URL')
					.setDesc('POST endpoint. JSON body: { title, message, priority }.')
					.addText(text => text
						.setValue(notif.webhookUrl)
						.setPlaceholder('https://example.com/webhook')
						.onChange(async (value) => {
							notif.webhookUrl = value.trim();
							await this.plugin.saveSettings();
						})
					);

				if (notif.webhookUrl) {
					new Setting(el)
						.setName('Test webhook')
						.addButton(btn => btn
							.setButtonText('Send test')
							.onClick(async () => {
								try {
									const resp = await fetch(notif.webhookUrl, {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({
											title: 'Postpartum Tracker',
											message: 'Test notification \u2014 webhook is working!',
											priority: 3,
										}),
									});
									if (resp.ok) new Notice('Webhook test sent!');
									else new Notice(`Webhook test failed: ${resp.status} ${await resp.text()}`);
								} catch (e) {
									new Notice(`Error: ${(e as Error).message}`);
								}
							})
						);
				}
			}
		}

		// ── Best setup combo guide ──
		if (notif.webhookEnabled) {
			const comboGuide = el.createDiv({ cls: 'pt-webhook-guide' });
			comboGuide.createEl('p', { cls: 'pt-webhook-guide-title', text: 'Best setup for reliable alarms' });

			comboGuide.createEl('p', { cls: 'pt-webhook-guide-note', text: 'Shared vault? Enable both ntfy and Pushover above \u2014 Android users subscribe to the ntfy topic, iOS users configure Pushover. Both receive every alert simultaneously.' });
			comboGuide.createEl('p', { cls: 'pt-webhook-guide-note', text: 'Solo user on Android: ntfy alone gives alarm-loop + offline scheduled delivery.' });
			comboGuide.createEl('p', { cls: 'pt-webhook-guide-note', text: 'Solo user on iOS: Pushover alone gives alarm-loop via Critical Alerts. Add ntfy for offline scheduled delivery as backup.' });

			const comboSteps = comboGuide.createEl('ol', { cls: 'pt-webhook-guide-steps' });
			comboSteps.createEl('li', { text: 'Enable the push services your household needs above' });
			comboSteps.createEl('li', { text: 'Enable Todoist integration (below) with due dates set to "Date + time"' });
			comboSteps.createEl('li', { text: 'With multiple services enabled:' });
			const subList = comboSteps.createEl('ul');
			subList.createEl('li', { text: 'Every alert fires to ALL enabled services simultaneously' });
			subList.createEl('li', { text: 'ntfy scheduled delivery works even after closing Obsidian' });
			subList.createEl('li', { text: 'Todoist creates tasks and sends its own reminder at the due time' });
			subList.createEl('li', { text: 'Redundancy: if one service is down, the others still work' });
		}

		// --- Todoist Integration ---
		this.buildTodoistSettings(el);
	}

	// ═══════════════════════════════════════════════════════════════
	//  Tab 3: General
	// ═══════════════════════════════════════════════════════════════

	private buildGeneralTab(el: HTMLElement): void {
		// --- Display ---
		new Setting(el).setName('Display').setHeading();

		new Setting(el)
			.setName('Time format')
			.setDesc('How times are displayed throughout the tracker.')
			.addDropdown(dd => dd
				.addOption('12h', '12-hour (2:30 PM)')
				.addOption('24h', '24-hour (14:30)')
				.setValue(this.plugin.settings.timeFormat)
				.onChange(async (value) => {
					this.plugin.settings.timeFormat = value as '12h' | '24h';
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Entry list window')
			.setDesc('How far back the entry list shows. 0 = today only (resets at midnight). Default 24 hours so late-night entries stay visible.')
			.addDropdown(dd => dd
				.addOption('0', 'Today only (midnight cutoff)')
				.addOption('12', 'Last 12 hours')
				.addOption('24', 'Last 24 hours')
				.addOption('48', 'Last 48 hours')
				.setValue(String(this.plugin.settings.entryWindowHours ?? 24))
				.onChange(async (value) => {
					this.plugin.settings.entryWindowHours = parseInt(value);
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Show event history')
			.setDesc('Show a unified chronological feed of all recent entries below the tracker sections.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showEventHistory)
				.onChange(async (value) => {
					this.plugin.settings.showEventHistory = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Haptic feedback')
			.setDesc('Vibrate on button presses (mobile only).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hapticFeedback)
				.onChange(async (value) => {
					this.plugin.settings.hapticFeedback = value;
					await this.plugin.saveSettings();
				})
			);

		// --- Appearance ---
		new Setting(el).setName('Appearance').setHeading();

		new Setting(el)
			.setName('Show button labels')
			.setDesc('Show text labels under quick-action buttons. Medication and tracker names are always visible.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showButtonLabels)
				.onChange(async (value) => {
					this.plugin.settings.showButtonLabels = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Button size')
			.setDesc('Size of quick-action buttons.')
			.addDropdown(dd => dd
				.addOption('compact', 'Compact')
				.addOption('normal', 'Normal')
				.addOption('large', 'Large')
				.setValue(this.plugin.settings.buttonSize)
				.onChange(async (value) => {
					this.plugin.settings.buttonSize = value as 'compact' | 'normal' | 'large';
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Button columns')
			.setDesc('Fixed number of columns for the button grid, or auto to fit available width.')
			.addDropdown(dd => dd
				.addOption('0', 'Auto')
				.addOption('2', '2 columns')
				.addOption('3', '3 columns')
				.addOption('4', '4 columns')
				.addOption('5', '5 columns')
				.addOption('6', '6 columns')
				.setValue(String(this.plugin.settings.buttonColumns))
				.onChange(async (value) => {
					this.plugin.settings.buttonColumns = parseInt(value, 10);
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Timer button animation')
			.setDesc('How active timer buttons are highlighted while running.')
			.addDropdown(dd => dd
				.addOption('pulse', 'Pulse (glow fades in/out)')
				.addOption('blink', 'Blink (opacity flashes)')
				.addOption('flash', 'Flash (hard on/off toggle)')
				.addOption('bounce', 'Bounce (scale + glow pulse)')
				.addOption('glow', 'Glow (steady glow ring)')
				.addOption('solid', 'Solid (no animation)')
				.setValue(this.plugin.settings.timerAnimation)
				.onChange(async (value) => {
					this.plugin.settings.timerAnimation = value as TimerAnimation;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Input mode')
			.setDesc('How data entry forms appear when logging past entries or editing.')
			.addDropdown(dd => dd
				.addOption('modal', 'Modal popup (centered dialog)')
				.addOption('inline', 'Inline panel (inside tracker section)')
				.setValue(this.plugin.settings.inputMode)
				.onChange(async (value) => {
					this.plugin.settings.inputMode = value as 'modal' | 'inline';
					await this.plugin.saveSettings();
				})
			);

		// --- Status bar ---
		new Setting(el)
			.setName('Status bar mode')
			.setDesc('What to show in the Obsidian status bar.')
			.addDropdown(dd => dd
				.addOption('live', 'Live info (last feed, active timers, alerts)')
				.addOption('badge', 'Alert count badge only')
				.addOption('off', 'Hidden')
				.setValue(this.plugin.settings.statusBarMode)
				.onChange(async (value) => {
					this.plugin.settings.statusBarMode = value as 'badge' | 'live' | 'off';
					await this.plugin.saveSettings();
					this.plugin.statusBarManager?.update();
				})
			);

		// --- Summary bar ---
		new Setting(el).setName('Summary bar').setHeading();

		new Setting(el)
			.setName('Show summary bar')
			.setDesc('Display a stats bar with daily counts from selected trackers.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showSummaryBar)
				.onChange(async (value) => {
					this.plugin.settings.showSummaryBar = value;
					await this.plugin.saveSettings();
					this.display();
				})
			);

		if (this.plugin.settings.showSummaryBar) {
			new Setting(el)
				.setName('Summary position')
				.setDesc('Where the summary bar appears in the tracker widget.')
				.addDropdown(dd => dd
					.addOption('top', 'Top (above buttons)')
					.addOption('after-buttons', 'After buttons')
					.addOption('bottom', 'Bottom (below sections)')
					.setValue(this.plugin.settings.summaryPosition || 'top')
					.onChange(async (value) => {
						this.plugin.settings.summaryPosition = value as 'top' | 'bottom' | 'after-buttons';
						await this.plugin.saveSettings();
					})
				);

			this.buildSummaryOrderSetting(el);
		}

		// --- Debug ---
		new Setting(el).setName('Developer').setHeading();

		new Setting(el)
			.setName('Enable debug log')
			.setDesc('Show developer commands in the command palette and enable verbose logging.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDebugLog)
				.onChange(async (value) => {
					this.plugin.settings.enableDebugLog = value;
					await this.plugin.saveSettings();
				})
			);

	}

	// ═══════════════════════════════════════════════════════════════
	//  Todoist Section (used within Notifications tab)
	// ═══════════════════════════════════════════════════════════════

	private buildTodoistSettings(el: HTMLElement): void {
		const todoist = this.plugin.settings.todoist;

		new Setting(el).setName('Todoist integration').setHeading();

		const statusEl = el.createDiv({ cls: 'pt-todoist-status' });
		this.updateTodoistStatus(statusEl, todoist);

		new Setting(el)
			.setName('Enable Todoist')
			.setDesc('Create tasks in Todoist for feeding reminders, medication schedules, and more.')
			.addToggle(toggle => toggle
				.setValue(todoist.enabled)
				.onChange(async (value) => {
					todoist.enabled = value;
					await this.plugin.saveSettings();
					this.display();
				})
			);

		if (!todoist.enabled) return;

		new Setting(el)
			.setName('API token')
			.setDesc('Get your token from todoist.com/app/settings/integrations/developer')
			.addText(text => {
				text.inputEl.type = 'password';
				text.inputEl.style.width = '250px';
				text
					.setValue(todoist.apiToken)
					.setPlaceholder('Paste your Todoist API token')
					.onChange(async (value) => {
						todoist.apiToken = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(el)
			.setName('Connection')
			.addButton(btn => btn
				.setButtonText('Test connection')
				.onClick(async () => {
					if (!todoist.apiToken) {
						new Notice('Enter an API token first');
						return;
					}
					btn.setDisabled(true);
					const ok = await this.plugin.todoistService.testConnection();
					btn.setDisabled(false);
					if (ok) {
						new Notice('Connected to Todoist successfully!');
						todoist.lastConnectedAt = Date.now();
						await this.plugin.saveSettings();
						this.updateTodoistStatus(statusEl, todoist);
					} else {
						new Notice('Connection failed. Check your API token.');
					}
				})
			)
			.addButton(btn => btn
				.setButtonText(todoist.setupComplete ? 'Re-setup project' : 'Setup project')
				.setCta()
				.onClick(async () => {
					if (!todoist.apiToken) {
						new Notice('Enter an API token first');
						return;
					}
					btn.setDisabled(true);
					const ok = await this.plugin.todoistService.setup();
					btn.setDisabled(false);
					if (ok) {
						new Notice(`Project "${todoist.projectName}" ready with sections!`);
						this.updateTodoistStatus(statusEl, todoist);
						this.display();
					} else {
						new Notice('Setup failed. Check console for details.');
					}
				})
			);

		new Setting(el)
			.setName('Project name')
			.setDesc('Name of the Todoist project to create/use.')
			.addText(text => text
				.setValue(todoist.projectName)
				.setPlaceholder('Postpartum tasks')
				.onChange(async (value) => {
					todoist.projectName = value.trim() || 'Postpartum tasks';
					await this.plugin.saveSettings();
				})
			);

		const workspaceSetting = new Setting(el)
			.setName('Team workspace')
			.setDesc('Create the project under a shared team so all members can see tasks. Leave as "Personal" for private use.');

		const workspaceDropdown = workspaceSetting.controlEl.createEl('select', { cls: 'dropdown' });
		workspaceDropdown.createEl('option', { text: 'Personal (no team)', attr: { value: '' } });
		if (todoist.workspaceId) {
			workspaceDropdown.createEl('option', { text: `Team ${todoist.workspaceId}`, attr: { value: todoist.workspaceId } });
			workspaceDropdown.value = todoist.workspaceId;
		}

		if (todoist.apiToken) {
			this.plugin.todoistService.fetchWorkspaces().then(workspaces => {
				workspaceDropdown.empty();
				workspaceDropdown.createEl('option', { text: 'Personal (no team)', attr: { value: '' } });
				for (const ws of workspaces) {
					workspaceDropdown.createEl('option', { text: ws.name, attr: { value: ws.id } });
				}
				workspaceDropdown.value = todoist.workspaceId || '';
				if (workspaces.length === 0) {
					workspaceSetting.setDesc('No team workspaces found on this account. Tasks will be personal.');
				}
			});
		}

		workspaceDropdown.addEventListener('change', async () => {
			todoist.workspaceId = workspaceDropdown.value;
			await this.plugin.saveSettings();
			if (todoist.setupComplete) {
				new Notice('Re-run "Setup project" to move it to the selected team.');
			}
		});

		if (!todoist.setupComplete) return;

		new Setting(el)
			.setName('Create tasks on alerts')
			.setDesc('Create a Todoist task when a notification fires (feeding overdue, med ready).')
			.addToggle(toggle => toggle
				.setValue(todoist.createOnAlert)
				.onChange(async (value) => {
					todoist.createOnAlert = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Create proactive tasks')
			.setDesc('After logging an entry, create a "next action" task (e.g., "Check if baby is hungry").')
			.addToggle(toggle => toggle
				.setValue(todoist.createOnLog)
				.onChange(async (value) => {
					todoist.createOnLog = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Due date style')
			.setDesc('How to set due dates on tasks. "None" puts timing info in the description only. Todoist reminders require a Pro subscription.')
			.addDropdown(dd => dd
				.addOption('none', 'None (description only)')
				.addOption('date', 'Date only (shows in Today view)')
				.addOption('datetime', 'Date + time (triggers reminder if Pro)')
				.setValue(todoist.dueDateStyle)
				.onChange(async (value) => {
					todoist.dueDateStyle = value as 'none' | 'date' | 'datetime';
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Feeding interval hint (hours)')
			.setDesc('Approximate hours between feedings. This is a soft estimate, not a deadline — babies cluster feed and intervals vary.')
			.addText(text => text
				.setValue(String(todoist.feedingIntervalHours))
				.setPlaceholder('3')
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > 0) {
						todoist.feedingIntervalHours = num;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(el)
			.setName('Task prefix')
			.setDesc('Optional prefix added to all task names (e.g., an emoji or tag).')
			.addText(text => text
				.setValue(todoist.taskPrefix)
				.setPlaceholder('')
				.onChange(async (value) => {
					todoist.taskPrefix = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Alert task priority')
			.setDesc('Todoist priority for alert-driven tasks (1 = normal, 4 = urgent).')
			.addDropdown(dd => dd
				.addOption('1', '1 - Normal')
				.addOption('2', '2 - Medium')
				.addOption('3', '3 - High')
				.addOption('4', '4 - Urgent')
				.setValue(String(todoist.alertPriority))
				.onChange(async (value) => {
					todoist.alertPriority = parseInt(value, 10);
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Proactive task priority')
			.setDesc('Todoist priority for proactive "next action" tasks.')
			.addDropdown(dd => dd
				.addOption('1', '1 - Normal')
				.addOption('2', '2 - Medium')
				.addOption('3', '3 - High')
				.addOption('4', '4 - Urgent')
				.setValue(String(todoist.proactivePriority))
				.onChange(async (value) => {
					todoist.proactivePriority = parseInt(value, 10);
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Task labels')
			.setDesc('Comma-separated labels to add to created tasks.')
			.addText(text => text
				.setValue(todoist.labels.join(', '))
				.setPlaceholder('baby, care')
				.onChange(async (value) => {
					todoist.labels = value.split(',').map(s => s.trim()).filter(Boolean);
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Suppress in-app toasts')
			.setDesc('Hide in-app toast popups when Todoist is handling reminders.')
			.addToggle(toggle => toggle
				.setValue(todoist.suppressToasts)
				.onChange(async (value) => {
					todoist.suppressToasts = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Two-way sync')
			.setDesc('When tasks are completed in Todoist, create corresponding entries in the tracker.')
			.addToggle(toggle => toggle
				.setValue(todoist.twoWaySync)
				.onChange(async (value) => {
					todoist.twoWaySync = value;
					await this.plugin.saveSettings();
				})
			);

		// --- Cleanup ---
		new Setting(el).setName('Cleanup').setHeading();

		new Setting(el)
			.setName('Clear local task cache')
			.setDesc('Remove locally tracked task references without touching Todoist. Use if tasks were manually deleted in Todoist.')
			.addButton(btn => btn
				.setButtonText('Clear cache')
				.onClick(() => {
					this.plugin.todoistService.clearLocalTaskMap();
					new Notice('Local task cache cleared.');
				})
			);

		new Setting(el)
			.setName('Remove project from Todoist')
			.setDesc('Permanently delete the Todoist project and all its tasks. This cannot be undone.')
			.addButton(btn => btn
				.setButtonText('Remove project')
				.setWarning()
				.onClick(async () => {
					const confirmed = confirm(
						`This will permanently delete the "${todoist.projectName}" project and all tasks in Todoist.\n\nThis cannot be undone. Continue?`
					);
					if (!confirmed) return;

					btn.setDisabled(true);
					btn.setButtonText('Removing...');
					const ok = await this.plugin.todoistService.removeProject();
					btn.setDisabled(false);
					if (ok) {
						new Notice('Todoist project removed and local state cleared.');
						this.display();
					} else {
						new Notice('Failed to remove project. Check todoist-debug.log.');
						btn.setButtonText('Remove project');
					}
				})
			);
	}

	// ═══════════════════════════════════════════════════════════════
	//  Custom Tracker Builder
	// ═══════════════════════════════════════════════════════════════

	/** Show the custom tracker creation form inline, inserted right after anchorEl. */
	private createCustomTracker(anchorEl: HTMLElement, onCreated: () => void): void {
		const editorId = 'pt-custom-tracker-creator';
		const existing = document.getElementById(editorId);
		if (existing) { existing.remove(); return; }

		const editor = document.createElement('div');
		editor.className = 'pt-med-editor pt-custom-tracker-editor';
		editor.id = editorId;
		anchorEl.after(editor);

		// State for the new tracker
		const state = {
			name: '',
			icon: '',
			description: '',
			category: 'general' as TrackerCategory,
			hasDuration: false,
			fields: [] as { key: string; label: string; type: string; options: string; unit: string; required: boolean; collectOn: string }[],
		};

		new Setting(editor).setName('New custom tracker').setHeading();

		new Setting(editor)
			.setName('Name')
			.setDesc('Display name for the tracker.')
			.addText(text => text
				.setPlaceholder('e.g., Water intake')
				.onChange(v => { state.name = v.trim(); })
			);

		{
			const iconSetting = new Setting(editor)
				.setName('Icon')
				.setDesc('Pick an emoji or type your own.');
			let iconInput: HTMLInputElement;
			iconSetting.addText(text => {
				text.setPlaceholder('\uD83D\uDCA7')
					.onChange(v => { state.icon = v.trim(); });
				iconInput = text.inputEl;
				iconInput.style.width = '60px';
				iconInput.style.fontSize = '1.3rem';
				iconInput.style.textAlign = 'center';
			});
			this.buildEmojiPicker(editor, (emoji) => {
				state.icon = emoji;
				iconInput.value = emoji;
			});
		}

		new Setting(editor)
			.setName('Description')
			.addText(text => text
				.setPlaceholder('Track daily water intake')
				.onChange(v => { state.description = v.trim(); })
			);

		new Setting(editor)
			.setName('Category')
			.addDropdown(dd => {
				dd.addOption('baby-care', 'Baby care');
				dd.addOption('baby-development', 'Baby development');
				dd.addOption('mother-recovery', "Mother's recovery");
				dd.addOption('general', 'General');
				dd.setValue('general');
				dd.onChange(v => { state.category = v as TrackerCategory; });
			});

		new Setting(editor)
			.setName('Duration tracking')
			.setDesc('Enable start/stop timer for this tracker.')
			.addToggle(toggle => toggle
				.setValue(false)
				.onChange(v => { state.hasDuration = v; })
			);

		// Fields section
		const fieldsHeading = new Setting(editor)
			.setName('Fields')
			.setDesc('Add data fields that are captured with each entry.');

		const fieldsContainer = editor.createDiv({ cls: 'pt-custom-fields-list' });

		const addFieldRow = () => {
			const fieldState = { key: '', label: '', type: 'text', options: '', unit: '', required: false, collectOn: '' as string };
			state.fields.push(fieldState);
			const fieldIdx = state.fields.length - 1;

			const row = fieldsContainer.createDiv({ cls: 'pt-custom-field-row' });

			new Setting(row)
				.setName(`Field ${fieldIdx + 1}`)
				.addText(text => text
					.setPlaceholder('Label (e.g., Amount)')
					.onChange(v => {
						fieldState.label = v.trim();
						fieldState.key = v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
					})
				)
				.addDropdown(dd => {
					dd.addOption('text', 'Text');
					dd.addOption('number', 'Number');
					dd.addOption('select', 'Select (dropdown)');
					dd.addOption('boolean', 'Yes/No');
					dd.addOption('rating', 'Rating (1-5)');
					dd.setValue('text');
					dd.onChange(v => { fieldState.type = v; });
				})
				.addExtraButton(btn => btn
					.setIcon('trash')
					.setTooltip('Remove field')
					.onClick(() => {
						state.fields.splice(fieldIdx, 1);
						row.remove();
					})
				);

			// Options input (shown for select type)
			new Setting(row)
				.setDesc('For select: comma-separated options. For number: unit (e.g., ml, oz).')
				.addText(text => text
					.setPlaceholder('option1, option2, option3  or  ml')
					.onChange(v => {
						fieldState.options = v.trim();
						fieldState.unit = v.trim();
					})
				)
				.addToggle(toggle => toggle
					.setTooltip('Required')
					.setValue(false)
					.onChange(v => { fieldState.required = v; })
				);

			// Collect-on timing (for duration trackers)
			new Setting(row)
				.setName('Collect when')
				.setDesc('When to ask for this field (duration trackers only).')
				.addDropdown(dd => {
					dd.addOption('', 'Default');
					dd.addOption('start', 'On start');
					dd.addOption('stop', 'On stop');
					dd.addOption('always', 'Both');
					dd.setValue('');
					dd.onChange(v => { fieldState.collectOn = v; });
				});
		};

		new Setting(editor)
			.addButton(btn => btn
				.setButtonText('Add field')
				.onClick(() => addFieldRow())
			);

		// Action buttons
		const actionRow = new Setting(editor);
		actionRow.addButton(btn => btn
			.setButtonText('Create')
			.setCta()
			.onClick(async () => {
				if (!state.name) {
					new Notice('Enter a name for the tracker.');
					return;
				}

				// Generate unique ID
				const id = 'custom-' + state.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

				// Check for duplicate
				const allIds = [
					...BUILTIN_MODULE_IDS,
					...TRACKER_LIBRARY.map(d => d.id),
					...this.plugin.settings.customTrackers.map(d => d.id),
				];
				if (allIds.includes(id)) {
					new Notice('A tracker with that name already exists.');
					return;
				}

				// Build fields
				const fields = state.fields
					.filter(f => f.label)
					.map(f => {
						const field: Record<string, unknown> = {
							key: f.key || f.label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
							label: f.label,
							type: f.type,
							required: f.required,
						};
						if (f.type === 'select' && f.options) {
							field.options = f.options.split(',').map(o => o.trim()).filter(Boolean);
						}
						if (f.type === 'number' && f.unit) {
							field.unit = f.unit;
						}
						if (f.type === 'rating') {
							field.min = 1;
							field.max = 5;
						}
						if (f.collectOn) {
							field.collectOn = f.collectOn;
						}
						return field;
					});

				const def = {
					id,
					displayName: state.name,
					category: state.category,
					icon: state.icon || '\uD83D\uDCCB',
					description: state.description || `Custom tracker: ${state.name}`,
					isSmart: false,
					fields,
					defaultOrder: 100,
					hasDuration: state.hasDuration,
				};

				this.plugin.settings.customTrackers.push(def as any);
				this.plugin.settings.enabledModules.push(id);
				await this.plugin.saveSettings();
				await this.plugin.rebuildRegistry();

				editor.remove();
				onCreated();
				new Notice(`Custom tracker "${state.name}" created!`);
			})
		);
		actionRow.addButton(btn => btn
			.setButtonText('Cancel')
			.onClick(() => editor.remove())
		);
	}

	/** Show inline editor for an existing custom tracker. */
	private showCustomTrackerEditor(settingItemEl: HTMLElement, trackerId: string): void {
		const editorId = `pt-custom-editor-${trackerId}`;
		const existing = document.getElementById(editorId);
		if (existing) { existing.remove(); return; }

		this.containerEl.querySelectorAll('.pt-tracker-editor, .pt-custom-tracker-editor').forEach(el => el.remove());

		const customs = this.plugin.settings.customTrackers;
		const def = customs.find(d => d.id === trackerId);
		if (!def) return;
		const snapshot = JSON.parse(JSON.stringify(def)) as typeof def;

		const editor = document.createElement('div');
		editor.className = 'pt-med-editor pt-tracker-editor';
		editor.id = editorId;
		settingItemEl.after(editor);

		new Setting(editor)
			.setName('Display name')
			.addText(text => text
				.setValue(def.displayName)
				.onChange(async (value) => {
					def.displayName = value.trim() || def.displayName;
					await this.plugin.saveSettings();
				})
			);

		{
			const iconSetting = new Setting(editor).setName('Icon');
			let iconInput: HTMLInputElement;
			iconSetting.addText(text => {
				text.setValue(def.icon)
					.onChange(async (value) => {
						def.icon = value.trim() || '\uD83D\uDCCB';
						await this.plugin.saveSettings();
					});
				iconInput = text.inputEl;
				iconInput.style.width = '60px';
				iconInput.style.fontSize = '1.3rem';
				iconInput.style.textAlign = 'center';
			});
			this.buildEmojiPicker(editor, async (emoji) => {
				def.icon = emoji;
				iconInput.value = emoji;
				await this.plugin.saveSettings();
			});
		}

		new Setting(editor)
			.setName('Description')
			.addText(text => text
				.setValue(def.description)
				.onChange(async (value) => {
					def.description = value.trim();
					await this.plugin.saveSettings();
				})
			);

		new Setting(editor)
			.setName('Category')
			.addDropdown(dd => {
				dd.addOption('baby-care', 'Baby care');
				dd.addOption('baby-development', 'Baby development');
				dd.addOption('mother-recovery', "Mother's recovery");
				dd.addOption('general', 'General');
				dd.setValue(def.category);
				dd.onChange(async (value) => {
					def.category = value as TrackerCategory;
					await this.plugin.saveSettings();
				});
			});

		new Setting(editor)
			.setName('Duration tracking')
			.addToggle(toggle => toggle
				.setValue(def.hasDuration ?? false)
				.onChange(async (value) => {
					def.hasDuration = value;
					await this.plugin.saveSettings();
				})
			);

		// Show fields (read-only summary for now — editing fields would break existing data)
		if (def.fields.length > 0) {
			const fieldDesc = def.fields.map(f => {
				let info = `${f.label} (${f.type})`;
				if (f.options) info += `: ${f.options.join(', ')}`;
				if (f.unit) info += ` [${f.unit}]`;
				return info;
			}).join(' | ');
			new Setting(editor)
				.setName('Fields')
				.setDesc(fieldDesc);
		}

		new Setting(editor)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(async () => {
					Object.assign(def, snapshot);
					await this.plugin.saveSettings();
					editor.remove();
					await this.plugin.rebuildRegistry();
					this.display();
				})
			)
			.addButton(btn => btn
				.setButtonText('Done')
				.setCta()
				.onClick(async () => {
					editor.remove();
					await this.plugin.rebuildRegistry();
					this.display();
				})
			);
	}

	// ═══════════════════════════════════════════════════════════════
	//  Helpers
	// ═══════════════════════════════════════════════════════════════

	/** Quick-pick emojis shown inline, organized by category. */
	private static readonly EMOJI_QUICK_PICKS: string[] = [
		'👶', '🍼', '🤱', '😴', '🧸', '🤲', '👣', '🎀', '💙', '💗',
		'💊', '🩹', '🌡️', '🧴', '⚖️', '🧊', '🛁', '🩸', '❤️', '🩺',
		'🚶', '🚽', '🚻', '💤', '🧘', '💧', '🍎', '☕', '🌞', '📝',
		'📋', '📏', '🧠', '😊', '😮', '⭐', '🔔', '📈', '⏱️', '✅',
	];

	/** Build the summary card reorder UI. */
	private buildSummaryOrderSetting(el: HTMLElement): void {
		new Setting(el)
			.setName('Visible summary modules')
			.setDesc('Check the trackers you want to appear in the summary bar. Reorder with arrows.');

		const enabledModules = this.plugin.settings.enabledModules;
		const summaryOrder = this.plugin.settings.summaryOrder;
		const visible = this.plugin.settings.visibleSummaryModules;

		// Build ordered list: summaryOrder first, then any enabled modules not yet in the list
		const ordered: string[] = [];
		for (const id of summaryOrder) {
			if (enabledModules.includes(id)) ordered.push(id);
		}
		for (const id of enabledModules) {
			if (!ordered.includes(id)) ordered.push(id);
		}

		// Get display names from registry + library
		const getDisplayName = (id: string): string => {
			const module = this.plugin.registry.get(id);
			return module?.displayName || id;
		};

		const listEl = el.createDiv({ cls: 'pt-summary-order-list' });

		const renderList = () => {
			listEl.empty();
			for (let i = 0; i < ordered.length; i++) {
				const id = ordered[i];
				const isVisible = visible.includes(id);
				const row = listEl.createDiv({ cls: 'pt-summary-order-row' });

				// Visibility checkbox (opt-in: checked = shown)
				const checkbox = row.createEl('input', {
					attr: { type: 'checkbox' },
					cls: 'pt-summary-order-checkbox',
				}) as HTMLInputElement;
				checkbox.checked = isVisible;
				checkbox.addEventListener('change', async () => {
					const idx = visible.indexOf(id);
					if (checkbox.checked && idx < 0) {
						visible.push(id);
					} else if (!checkbox.checked && idx >= 0) {
						visible.splice(idx, 1);
					}
					this.plugin.settings.visibleSummaryModules = [...visible];
					await this.plugin.saveSettings();
				});

				// Move buttons
				const moveUp = row.createEl('button', { cls: 'pt-summary-order-btn', text: '\u25B2' });
				moveUp.disabled = i === 0;
				moveUp.addEventListener('click', async () => {
					if (i === 0) return;
					[ordered[i], ordered[i - 1]] = [ordered[i - 1], ordered[i]];
					this.plugin.settings.summaryOrder = [...ordered];
					await this.plugin.saveSettings();
					renderList();
				});

				const moveDown = row.createEl('button', { cls: 'pt-summary-order-btn', text: '\u25BC' });
				moveDown.disabled = i === ordered.length - 1;
				moveDown.addEventListener('click', async () => {
					if (i >= ordered.length - 1) return;
					[ordered[i], ordered[i + 1]] = [ordered[i + 1], ordered[i]];
					this.plugin.settings.summaryOrder = [...ordered];
					await this.plugin.saveSettings();
					renderList();
				});

				const label = row.createSpan({ cls: 'pt-summary-order-label', text: getDisplayName(id) });
				if (!isVisible) label.addClass('pt-summary-order-label--hidden');
			}
		};

		renderList();
	}

	/** Build an inline emoji picker with quick picks + searchable modal. */
	private buildEmojiPicker(container: HTMLElement, onSelect: (emoji: string) => void): void {
		const picker = container.createDiv({ cls: 'pt-emoji-picker' });
		let expanded = false;

		const toggleBtn = picker.createEl('button', {
			cls: 'pt-emoji-toggle',
			text: 'Pick emoji...',
		});

		const grid = picker.createDiv({ cls: 'pt-emoji-grid pt-hidden' });

		// Quick pick row
		const row = grid.createDiv({ cls: 'pt-emoji-row' });
		for (const emoji of PostpartumTrackerSettingsTab.EMOJI_QUICK_PICKS) {
			const btn = row.createEl('button', {
				cls: 'pt-emoji-btn',
				text: emoji,
			});
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				onSelect(emoji);
				grid.addClass('pt-hidden');
				expanded = false;
				toggleBtn.textContent = `Picked: ${emoji}`;
			});
		}

		// Browse more button → opens fuzzy search modal
		const browseBtn = grid.createEl('button', {
			cls: 'pt-emoji-browse-btn',
			text: 'Browse more emojis...',
		});
		browseBtn.addEventListener('click', (e) => {
			e.preventDefault();
			new EmojiPickerModal(this.app, (emoji) => {
				onSelect(emoji);
				grid.addClass('pt-hidden');
				expanded = false;
				toggleBtn.textContent = `Picked: ${emoji}`;
			}).open();
		});

		toggleBtn.addEventListener('click', (e) => {
			e.preventDefault();
			expanded = !expanded;
			if (expanded) {
				grid.removeClass('pt-hidden');
			} else {
				grid.addClass('pt-hidden');
			}
		});
	}

	private updateTodoistStatus(el: HTMLElement, todoist: typeof this.plugin.settings.todoist): void {
		el.empty();
		const connected = todoist.setupComplete && todoist.lastConnectedAt > 0;
		el.createSpan({ cls: `pt-todoist-dot ${connected ? 'pt-todoist-dot--connected' : ''}` });
		const text = connected
			? `Connected \u2022 Project: ${todoist.projectName}`
			: 'Not connected';
		el.createSpan({ text });
	}

	/** Show inline editor for a library tracker's configurable settings. */
	private showTrackerEditor(settingItemEl: HTMLElement, trackerId: string): void {
		const editorId = `pt-tracker-editor-${trackerId}`;

		// Toggle off if already open
		const existing = document.getElementById(editorId);
		if (existing) {
			existing.remove();
			return;
		}

		// Close any other open tracker editors
		this.containerEl.querySelectorAll('.pt-tracker-editor').forEach(el => el.remove());

		const def = TRACKER_LIBRARY.find(d => d.id === trackerId);
		if (!def) return;

		const overrides = this.plugin.settings.libraryTrackerOverrides;
		const override: LibraryTrackerOverride = overrides[trackerId] || {};
		const snapshot = JSON.parse(JSON.stringify(override)) as LibraryTrackerOverride;

		const editor = document.createElement('div');
		editor.className = 'pt-tracker-editor pt-med-editor';
		editor.id = editorId;
		settingItemEl.after(editor);

		// Display name override
		new Setting(editor)
			.setName('Display name')
			.setDesc('Custom name (leave empty for default).')
			.addText(text => text
				.setValue(override.displayName || '')
				.setPlaceholder(def.displayName)
				.onChange(async (value) => {
					if (!overrides[trackerId]) overrides[trackerId] = {};
					overrides[trackerId].displayName = value.trim() || undefined;
					await this.plugin.saveSettings();
				})
			);

		// Icon override with emoji picker
		{
			const iconSetting = new Setting(editor).setName('Icon');
			let iconInput: HTMLInputElement;
			iconSetting.addText(text => {
				text.setValue(override.icon || '')
					.setPlaceholder(def.icon)
					.onChange(async (value) => {
						if (!overrides[trackerId]) overrides[trackerId] = {};
						overrides[trackerId].icon = value.trim() || undefined;
						await this.plugin.saveSettings();
					});
				iconInput = text.inputEl;
				iconInput.style.width = '60px';
				iconInput.style.fontSize = '1.3rem';
				iconInput.style.textAlign = 'center';
			});
			this.buildEmojiPicker(editor, async (emoji) => {
				if (!overrides[trackerId]) overrides[trackerId] = {};
				overrides[trackerId].icon = emoji;
				iconInput.value = emoji;
				await this.plugin.saveSettings();
			});
		}

		// Notification settings (for trackers with notification config)
		if (def.notificationConfig) {
			const notifOverride = override.notification || {
				reminderEnabled: def.notificationConfig.reminderEnabled,
				reminderIntervalHours: def.notificationConfig.reminderIntervalHours,
			};

			new Setting(editor)
				.setName('Reminder enabled')
				.setDesc(def.notificationConfig.reminderMessage)
				.addToggle(toggle => toggle
					.setValue(notifOverride.reminderEnabled)
					.onChange(async (value) => {
						if (!overrides[trackerId]) overrides[trackerId] = {};
						if (!overrides[trackerId].notification) {
							overrides[trackerId].notification = { ...notifOverride };
						}
						overrides[trackerId].notification!.reminderEnabled = value;
						await this.plugin.saveSettings();
					})
				);

			new Setting(editor)
				.setName('Reminder interval (hours)')
				.addText(text => text
					.setValue(String(notifOverride.reminderIntervalHours))
					.setPlaceholder(String(def.notificationConfig!.reminderIntervalHours))
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num > 0) {
							if (!overrides[trackerId]) overrides[trackerId] = {};
							if (!overrides[trackerId].notification) {
								overrides[trackerId].notification = { ...notifOverride };
							}
							overrides[trackerId].notification!.reminderIntervalHours = num;
							await this.plugin.saveSettings();
						}
					})
				);
		}

		// Field info (read-only)
		if (def.fields.length > 0) {
			const fieldDesc = def.fields.map(f => {
				let info = `${f.label} (${f.type})`;
				if (f.options) info += `: ${f.options.join(', ')}`;
				if (f.unit) info += ` [${f.unit}]`;
				return info;
			}).join(' | ');
			new Setting(editor)
				.setName('Fields')
				.setDesc(fieldDesc);
		}

		if (def.hasDuration) {
			new Setting(editor)
				.setName('Duration tracking')
				.setDesc('This tracker supports start/stop timer.');
		}

		new Setting(editor)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(async () => {
					if (Object.keys(snapshot).length === 0) {
						delete overrides[trackerId];
					} else {
						overrides[trackerId] = snapshot;
					}
					await this.plugin.saveSettings();
					editor.remove();
					this.display();
				})
			)
			.addButton(btn => btn
				.setButtonText('Done')
				.setCta()
				.onClick(() => {
					editor.remove();
					this.display();
				})
			);
	}

	private showMedEditor(settingItemEl: HTMLElement, index: number): void {
		const meds = this.plugin.settings.medication.medications;
		const med = meds[index];
		const snapshot = JSON.parse(JSON.stringify(med)) as typeof med;
		const editorId = `pt-med-editor-${index}`;

		const existing = document.getElementById(editorId);
		if (existing) {
			existing.remove();
			return;
		}

		this.containerEl.querySelectorAll('.pt-med-editor').forEach(el => el.remove());

		const editor = document.createElement('div');
		editor.className = 'pt-med-editor';
		editor.id = editorId;
		settingItemEl.after(editor);

		new Setting(editor)
			.setName('Brand name')
			.addText(text => text
				.setValue(med.name)
				.onChange(async (value) => {
					med.name = value.trim() || 'Unnamed';
					await this.plugin.saveSettings();
				})
			);

		new Setting(editor)
			.setName('Technical/generic name')
			.setDesc('Chemical or generic name (e.g., Acetaminophen).')
			.addText(text => text
				.setValue(med.technicalName || '')
				.onChange(async (value) => {
					med.technicalName = value.trim() || undefined;
					await this.plugin.saveSettings();
				})
			);

		new Setting(editor)
			.setName('Description')
			.setDesc('Brief description of what this is for.')
			.addText(text => text
				.setValue(med.description || '')
				.setPlaceholder('e.g., Pain reliever and fever reducer')
				.onChange(async (value) => {
					med.description = value.trim() || undefined;
					await this.plugin.saveSettings();
				})
			);

		new Setting(editor)
			.setName('Dosage')
			.addText(text => text
				.setValue(med.dosage)
				.setPlaceholder('e.g., 500mg')
				.onChange(async (value) => {
					med.dosage = value.trim();
					await this.plugin.saveSettings();
				})
			);

		new Setting(editor)
			.setName('Minimum hours between uses')
			.setDesc('Set to 0 for "as needed" items.')
			.addText(text => text
				.setValue(String(med.minIntervalHours))
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num >= 0) {
						med.minIntervalHours = num;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(editor)
			.setName('Maximum uses per 24 hours')
			.setDesc('Set to 0 for unlimited.')
			.addText(text => text
				.setValue(String(med.maxDailyDoses))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 0) {
						med.maxDailyDoses = num;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(editor)
			.setName('Category')
			.addDropdown(dd => dd
				.addOption('medication', 'Medication')
				.addOption('remedy', 'Remedy / topical')
				.setValue(med.category || 'medication')
				.onChange(async (value) => {
					med.category = value as 'medication' | 'remedy';
					await this.plugin.saveSettings();
				})
			);

		{
			const iconSetting = new Setting(editor).setName('Icon');
			let iconInput: HTMLInputElement;
			iconSetting.addText(text => {
				text.setValue(med.icon)
					.onChange(async (value) => {
						med.icon = value.trim() || '\uD83D\uDC8A';
						await this.plugin.saveSettings();
					});
				iconInput = text.inputEl;
				iconInput.style.width = '60px';
				iconInput.style.fontSize = '1.3rem';
				iconInput.style.textAlign = 'center';
			});
			this.buildEmojiPicker(editor, async (emoji) => {
				med.icon = emoji;
				iconInput.value = emoji;
				await this.plugin.saveSettings();
			});
		}

		new Setting(editor)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(async () => {
					Object.assign(med, snapshot);
					await this.plugin.saveSettings();
					editor.remove();
					this.display();
				})
			)
			.addButton(btn => btn
				.setButtonText('Done')
				.setCta()
				.onClick(() => {
					editor.remove();
					this.display();
				})
			);
	}
}
