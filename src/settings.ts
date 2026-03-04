import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type PostpartumTrackerPlugin from './main';
import type { NotificationType, TrackerCategory, LibraryTrackerOverride } from './types';
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

		new Setting(el)
			.setName('Wet diaper alert threshold')
			.setDesc('Minimum wet diapers per day before showing a warning.')
			.addText(text => text
				.setValue(String(this.plugin.settings.diaper.alertThreshold))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 0) {
						this.plugin.settings.diaper.alertThreshold = num;
						await this.plugin.saveSettings();
					}
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

		new Setting(el).setName('Notifications').setHeading();

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
			.setDesc('How often to check for new alerts.')
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
			.setDesc('Alert when time since last feeding exceeds the threshold.')
			.addToggle(toggle => toggle
				.setValue(notif.feedingReminderEnabled)
				.onChange(async (value) => {
					notif.feedingReminderEnabled = value;
					await this.plugin.saveSettings();
				})
			)
			.addText(text => text
				.setValue(String(notif.feedingReminderHours))
				.setPlaceholder('3')
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > 0) {
						notif.feedingReminderHours = num;
						await this.plugin.saveSettings();
					}
				})
			);

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

		// --- Webhook ---
		new Setting(el).setName('Webhook').setHeading();

		new Setting(el)
			.setName('Enable webhook')
			.setDesc('Send notifications to an external service (Gotify, ntfy.sh, etc.).')
			.addToggle(toggle => toggle
				.setValue(notif.webhookEnabled)
				.onChange(async (value) => {
					notif.webhookEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(el)
			.setName('Webhook URL')
			.setDesc('POST endpoint for notifications. JSON body: { title, message, priority, extras }.')
			.addText(text => text
				.setValue(notif.webhookUrl)
				.setPlaceholder('https://gotify.example.com/message?token=...')
				.onChange(async (value) => {
					notif.webhookUrl = value.trim();
					await this.plugin.saveSettings();
				})
			);

		if (notif.webhookEnabled && notif.webhookUrl) {
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
									title: 'Postpartum Tracker test',
									message: 'If you see this, webhooks are working!',
									priority: 5,
									extras: { category: 'test', plugin: 'obsidian-postpartum-tracker' },
								}),
							});
							if (resp.ok) {
								new Notice('Webhook test sent successfully!');
							} else {
								new Notice(`Webhook test failed: ${resp.status} ${resp.statusText}`);
							}
						} catch (e) {
							new Notice(`Webhook error: ${(e as Error).message}`);
						}
					})
				);
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
			.setName('Haptic feedback')
			.setDesc('Vibrate on button presses (mobile only).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hapticFeedback)
				.onChange(async (value) => {
					this.plugin.settings.hapticFeedback = value;
					await this.plugin.saveSettings();
				})
			);

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
			fields: [] as { key: string; label: string; type: string; options: string; unit: string; required: boolean }[],
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
			const fieldState = { key: '', label: '', type: 'text', options: '', unit: '', required: false };
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

		new Setting(editor)
			.setName('Icon')
			.addText(text => text
				.setValue(med.icon)
				.onChange(async (value) => {
					med.icon = value.trim() || '\uD83D\uDC8A';
					await this.plugin.saveSettings();
				})
			);

		new Setting(editor)
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
