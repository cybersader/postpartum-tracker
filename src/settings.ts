import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type PostpartumTrackerPlugin from './main';
import type { NotificationType, TrackerCategory } from './types';
import { TRACKER_LIBRARY, TRACKER_CATEGORIES, BUILTIN_MODULE_IDS } from './trackers/library';

/**
 * Plugin settings tab.
 * Minimal for MVP -- will grow as modules are added.
 */
export class PostpartumTrackerSettingsTab extends PluginSettingTab {
	plugin: PostpartumTrackerPlugin;

	constructor(app: App, plugin: PostpartumTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- Display ---
		new Setting(containerEl).setName('Display').setHeading();

		new Setting(containerEl)
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

		new Setting(containerEl)
			.setName('Haptic feedback')
			.setDesc('Vibrate on button presses (mobile only).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hapticFeedback)
				.onChange(async (value) => {
					this.plugin.settings.hapticFeedback = value;
					await this.plugin.saveSettings();
				})
			);

		// --- Tracker Library ---
		new Setting(containerEl).setName('Tracker library').setHeading();
		new Setting(containerEl)
			.setDesc('Enable or disable tracking modules. Core modules have deep notification and Todoist integration. Smart modules support automatic reminders. Reload the plugin after changing these.');

		const enabledModules = this.plugin.settings.enabledModules;

		// Group trackers by category, core modules first
		const coreModuleIds = new Set(BUILTIN_MODULE_IDS as readonly string[]);
		const categories: TrackerCategory[] = ['baby-care', 'baby-development', 'mother-recovery', 'general'];

		for (const cat of categories) {
			const catMeta = TRACKER_CATEGORIES[cat];

			// Core modules in baby-care
			if (cat === 'baby-care') {
				new Setting(containerEl)
					.setName(catMeta.label)
					.setDesc(catMeta.description)
					.setHeading();

				for (const id of BUILTIN_MODULE_IDS) {
					const module = this.plugin.registry.get(id);
					if (!module) continue;
					const badges = '\u00A0\u00A0[core]';
					new Setting(containerEl)
						.setName(`${module.displayName}${badges}`)
						.setDesc('Core module with built-in notifications and Todoist integration.')
						.addToggle(toggle => toggle
							.setValue(enabledModules.includes(id))
							.onChange(async (value) => {
								if (value && !enabledModules.includes(id)) {
									enabledModules.push(id);
								} else if (!value) {
									const idx = enabledModules.indexOf(id);
									if (idx >= 0) enabledModules.splice(idx, 1);
								}
								await this.plugin.saveSettings();
								new Notice('Reload the plugin to apply changes.');
							})
						);
				}
				continue;
			}

			// Library trackers for this category
			const catTrackers = TRACKER_LIBRARY.filter(d => d.category === cat);
			if (catTrackers.length === 0) continue;

			new Setting(containerEl)
				.setName(catMeta.label)
				.setDesc(catMeta.description)
				.setHeading();

			for (const def of catTrackers) {
				const badges = def.isSmart ? '\u00A0\u00A0[smart]' : '';
				new Setting(containerEl)
					.setName(`${def.icon} ${def.displayName}${badges}`)
					.setDesc(def.description)
					.addToggle(toggle => toggle
						.setValue(enabledModules.includes(def.id))
						.onChange(async (value) => {
							if (value && !enabledModules.includes(def.id)) {
								enabledModules.push(def.id);
							} else if (!value) {
								const idx = enabledModules.indexOf(def.id);
								if (idx >= 0) enabledModules.splice(idx, 1);
							}
							await this.plugin.saveSettings();
							new Notice('Reload the plugin to apply changes.');
						})
					);
			}
		}

		// --- Feeding ---
		new Setting(containerEl).setName('Feeding').setHeading();

		new Setting(containerEl)
			.setName('Show live timer')
			.setDesc('Display a running timer during active feedings.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.feeding.showTimer)
				.onChange(async (value) => {
					this.plugin.settings.feeding.showTimer = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
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
		new Setting(containerEl).setName('Diapers').setHeading();

		new Setting(containerEl)
			.setName('Show color picker')
			.setDesc('Show stool color selection after logging dirty diapers.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.diaper.showColorPicker)
				.onChange(async (value) => {
					this.plugin.settings.diaper.showColorPicker = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
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
		new Setting(containerEl).setName('Medication').setHeading();

		const meds = this.plugin.settings.medication.medications;

		// Group by category
		const medications = meds.map((m, i) => ({ med: m, idx: i })).filter(x => (x.med.category || 'medication') === 'medication');
		const remedies = meds.map((m, i) => ({ med: m, idx: i })).filter(x => x.med.category === 'remedy');

		const renderMedItem = (med: typeof meds[0], i: number) => {
			const techLabel = med.technicalName ? ` (${med.technicalName})` : '';
			const intervalDesc = med.minIntervalHours > 0 ? `Every ${med.minIntervalHours}h` : 'As needed';
			const maxDesc = med.maxDailyDoses > 0 ? `Max ${med.maxDailyDoses}/day` : '';
			const desc = [med.dosage || 'No dosage', intervalDesc, maxDesc].filter(Boolean).join(' \u2022 ');

			const medSetting = new Setting(containerEl)
				.setName(`${med.icon} ${med.name}${techLabel}`)
				.setDesc(desc);

			// Capture the setting element for inline editor insertion
			const settingItemEl = containerEl.lastElementChild as HTMLElement;

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

		// Medications sub-group
		for (const { med, idx } of medications) renderMedItem(med, idx);

		new Setting(containerEl)
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
		new Setting(containerEl).setName('Recovery care').setHeading();
		new Setting(containerEl)
			.setDesc('Topical remedies, sprays, and perineal care products. Toggle items on to track when you last used them.');

		for (const { med, idx } of remedies) renderMedItem(med, idx);

		// Add custom remedy button
		new Setting(containerEl)
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
		// --- Notifications ---
		new Setting(containerEl).setName('Notifications').setHeading();

		const notif = this.plugin.settings.notifications;

		new Setting(containerEl)
			.setName('Enable notifications')
			.setDesc('Show alerts for feeding times, medication doses, and more.')
			.addToggle(toggle => toggle
				.setValue(notif.enabled)
				.onChange(async (value) => {
					notif.enabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
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
					// Request permission if needed
					if ((value === 'system' || value === 'both') &&
						'Notification' in window &&
						Notification.permission === 'default') {
						Notification.requestPermission();
					}
				})
			);

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
			.setName('Medication dose ready')
			.setDesc('Alert when a medication dose becomes safe to take.')
			.addToggle(toggle => toggle
				.setValue(notif.medDoseReadyEnabled)
				.onChange(async (value) => {
					notif.medDoseReadyEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
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
		new Setting(containerEl).setName('Webhook').setHeading();

		new Setting(containerEl)
			.setName('Enable webhook')
			.setDesc('Send notifications to an external service (Gotify, ntfy.sh, etc.).')
			.addToggle(toggle => toggle
				.setValue(notif.webhookEnabled)
				.onChange(async (value) => {
					notif.webhookEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
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
			new Setting(containerEl)
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
		this.buildTodoistSettings(containerEl);
	}

	/** Build the Todoist integration settings section. */
	private buildTodoistSettings(containerEl: HTMLElement): void {
		const todoist = this.plugin.settings.todoist;

		new Setting(containerEl).setName('Todoist integration').setHeading();

		// Connection status
		const statusEl = containerEl.createDiv({ cls: 'pt-todoist-status' });
		this.updateTodoistStatus(statusEl, todoist);

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		// Test connection + Setup buttons
		new Setting(containerEl)
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

		new Setting(containerEl)
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

		// Team workspace selector
		const workspaceSetting = new Setting(containerEl)
			.setName('Team workspace')
			.setDesc('Create the project under a shared team so all members can see tasks. Leave as "Personal" for private use.');

		const workspaceDropdown = workspaceSetting.controlEl.createEl('select', { cls: 'dropdown' });
		workspaceDropdown.createEl('option', { text: 'Personal (no team)', attr: { value: '' } });
		if (todoist.workspaceId) {
			workspaceDropdown.createEl('option', { text: `Team ${todoist.workspaceId}`, attr: { value: todoist.workspaceId } });
			workspaceDropdown.value = todoist.workspaceId;
		}

		// Load workspaces from API when token is available
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

		// --- Task creation settings ---
		new Setting(containerEl)
			.setName('Create tasks on alerts')
			.setDesc('Create a Todoist task when a notification fires (feeding overdue, med ready).')
			.addToggle(toggle => toggle
				.setValue(todoist.createOnAlert)
				.onChange(async (value) => {
					todoist.createOnAlert = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Create proactive tasks')
			.setDesc('After logging an entry, create a "next action" task (e.g., "Check if baby is hungry").')
			.addToggle(toggle => toggle
				.setValue(todoist.createOnLog)
				.onChange(async (value) => {
					todoist.createOnLog = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		// --- Behavior ---
		new Setting(containerEl)
			.setName('Suppress in-app toasts')
			.setDesc('Hide in-app toast popups when Todoist is handling reminders.')
			.addToggle(toggle => toggle
				.setValue(todoist.suppressToasts)
				.onChange(async (value) => {
					todoist.suppressToasts = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Two-way sync')
			.setDesc('When tasks are completed in Todoist, create corresponding entries in the tracker.')
			.addToggle(toggle => toggle
				.setValue(todoist.twoWaySync)
				.onChange(async (value) => {
					todoist.twoWaySync = value;
					await this.plugin.saveSettings();
				})
			);
	}

	/** Update the Todoist connection status indicator. */
	private updateTodoistStatus(el: HTMLElement, todoist: typeof this.plugin.settings.todoist): void {
		el.empty();
		const connected = todoist.setupComplete && todoist.lastConnectedAt > 0;
		const dot = el.createSpan({ cls: `pt-todoist-dot ${connected ? 'pt-todoist-dot--connected' : ''}` });
		const text = connected
			? `Connected \u2022 Project: ${todoist.projectName}`
			: 'Not connected';
		el.createSpan({ text });
	}

	/** Show inline editor for a medication's fields, inserted directly after the clicked item. */
	private showMedEditor(settingItemEl: HTMLElement, index: number): void {
		const meds = this.plugin.settings.medication.medications;
		const med = meds[index];
		const editorId = `pt-med-editor-${index}`;

		// Remove existing editor if any (toggle off)
		const existing = document.getElementById(editorId);
		if (existing) {
			existing.remove();
			return;
		}

		// Remove any other open editors
		this.containerEl.querySelectorAll('.pt-med-editor').forEach(el => el.remove());

		// Create editor and insert directly after the setting item
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
					this.display(); // Refresh to show updated name/desc
				})
			);
	}
}
