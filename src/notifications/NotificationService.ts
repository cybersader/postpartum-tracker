/**
 * NotificationService — Periodically scans tracker data in the vault
 * and fires notifications for feeding reminders, medication dose timers,
 * and other configurable alerts.
 *
 * Runs at the Plugin level (not inside the ephemeral widget).
 * Reads tracker data by finding postpartum-tracker code blocks in markdown files.
 */

import { TFile } from 'obsidian';
import type PostpartumTrackerPlugin from '../main';
import type {
	PostpartumData,
	FeedingEntry,
	MedicationEntry,
	MedicationConfig,
	NotificationItem,
	NotificationSettings,
	SimpleTrackerEntry,
	TrackerEvent,
} from '../types';
import { EMPTY_DATA, DEFAULT_MEDICATIONS } from '../types';
import { TRACKER_LIBRARY } from '../trackers/library';
import { getDynamicFeedingIntervalHours } from '../data/dateUtils';
import { ToastNotification } from './ToastNotification';

/** Snoozed notification IDs + when the snooze expires */
interface SnoozeState {
	[notificationId: string]: number; // timestamp when snooze expires
}

export class NotificationService {
	private plugin: PostpartumTrackerPlugin;
	private intervalId: number | null = null;
	private initialTimeoutId: number | null = null;
	private toast: ToastNotification;
	private statusBarEl: HTMLElement | null = null;

	/** Active notifications waiting to be seen/dismissed */
	private activeNotifications: Map<string, NotificationItem> = new Map();
	/** Snooze state persisted in localStorage */
	private snoozeState: SnoozeState = {};
	/** Track which notification IDs have been fired this session — prevents re-firing until condition clears */
	private firedThisSession: Set<string> = new Set();

	private static readonly SNOOZE_KEY = 'pt-notification-snooze';

	constructor(plugin: PostpartumTrackerPlugin) {
		this.plugin = plugin;
		this.toast = new ToastNotification(plugin);
		this.loadSnoozeState();
	}

	/** Start the periodic notification check loop. */
	start(): void {
		this.stop(); // Clear any existing interval

		const settings = this.getSettings();
		if (!settings.enabled) return;

		const intervalMs = Math.max(settings.checkIntervalMin, 0.5) * 60_000;

		// Initial check after a short delay (let vault finish loading)
		this.initialTimeoutId = window.setTimeout(() => {
			this.initialTimeoutId = null;
			this.check();
		}, 5_000);

		this.intervalId = window.setInterval(() => this.check(), intervalMs);
	}

	/** Stop the periodic check loop and clean up UI. */
	stop(): void {
		if (this.initialTimeoutId !== null) {
			window.clearTimeout(this.initialTimeoutId);
			this.initialTimeoutId = null;
		}
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
		// Destroy toast UI so hot-reload doesn't leave orphaned toasts in the DOM
		this.toast.destroy();
		this.activeNotifications.clear();
		this.firedThisSession.clear();
	}

	/** Add status bar element. */
	setStatusBarEl(el: HTMLElement): void {
		this.statusBarEl = el;
	}

	/** Dismiss a specific notification. */
	dismiss(notificationId: string): void {
		this.activeNotifications.delete(notificationId);
		this.updateStatusBar();
	}

	/** Snooze a notification for the given number of minutes. */
	snooze(notificationId: string, minutes: number): void {
		this.snoozeState[notificationId] = Date.now() + minutes * 60_000;
		this.saveSnoozeState();
		this.activeNotifications.delete(notificationId);
		this.updateStatusBar();
	}

	/** Get all active (non-snoozed) notifications. */
	getActive(): NotificationItem[] {
		return Array.from(this.activeNotifications.values());
	}

	// ── Core Check Logic ──

	/** Main check: scan vault data, evaluate conditions, fire notifications. */
	async check(): Promise<void> {
		const settings = this.getSettings();
		if (!settings.enabled) return;

		// Clean expired snoozes
		this.cleanSnoozeState();

		// Find and parse the most recent tracker data from vault
		const data = await this.scanVaultForData();
		if (!data) return;

		const now = Date.now();
		const notifications: NotificationItem[] = [];

		// Feeding reminder (dynamic interval based on baby's age)
		if (settings.feedingReminderEnabled) {
			const effectiveHours = settings.feedingReminderOverride > 0
				? settings.feedingReminderOverride
				: getDynamicFeedingIntervalHours(data.meta?.birthDate);
			const feedingAlert = this.checkFeedingReminder(data, effectiveHours, now);
			if (feedingAlert) notifications.push(feedingAlert);
		}

		// Medication dose ready
		if (settings.medDoseReadyEnabled) {
			notifications.push(...this.checkMedicationDoses(data, settings, now));
		}

		// Medication alternating schedule
		if (settings.medAlternatingEnabled) {
			const altAlert = this.checkAlternatingMeds(data, now);
			if (altAlert) notifications.push(altAlert);
		}

		// Simple tracker reminders (library trackers with notificationConfig)
		for (const def of TRACKER_LIBRARY) {
			if (!def.notificationConfig?.reminderEnabled) continue;
			if (!this.plugin.settings.enabledModules.includes(def.id)) continue;
			const entries = (data.trackers[def.id] || []) as SimpleTrackerEntry[];
			const alert = this.checkSimpleTrackerReminder(def.id, def.notificationConfig, entries, now);
			if (alert) notifications.push(alert);
		}

		// Process notifications
		for (const notif of notifications) {
			// Skip if snoozed
			if (this.snoozeState[notif.id] && this.snoozeState[notif.id] > now) continue;
			// Skip if already fired this session (prevents re-fire after dismiss)
			// firedThisSession is cleared when the condition no longer applies (see cleanup below)
			if (this.firedThisSession.has(notif.id)) continue;

			this.activeNotifications.set(notif.id, notif);
			this.firedThisSession.add(notif.id);

			// Fire the notification via configured channels
			this.fireNotification(notif, settings);
		}

		// Remove notifications whose conditions are no longer met
		for (const [id] of this.activeNotifications) {
			if (!notifications.find(n => n.id === id)) {
				this.activeNotifications.delete(id);
				this.firedThisSession.delete(id);
				// Notify Todoist that the condition cleared
				this.plugin.todoistService?.onNotificationCleared(id);
			}
		}

		this.updateStatusBar();

		// Two-way sync: check if Todoist tasks were completed externally
		this.plugin.todoistService?.syncFromTodoist();

		// Clean stale Todoist task entries
		this.plugin.todoistService?.cleanStaleEntries();
	}

	// ── Alert Evaluators ──

	private checkFeedingReminder(
		data: PostpartumData,
		thresholdHours: number,
		now: number
	): NotificationItem | null {
		const feedings = (data.trackers.feeding || []) as FeedingEntry[];
		if (feedings.length === 0) return null;

		// Find last completed feeding
		const completed = feedings.filter(f => f.end !== null);
		if (completed.length === 0) return null;

		// If there's an active feeding right now, no alert needed
		const active = feedings.find(f => f.end === null);
		if (active) return null;

		const last = completed[completed.length - 1];
		const lastEndTime = new Date(last.end!).getTime();
		const hoursSince = (now - lastEndTime) / 3_600_000;

		if (hoursSince >= thresholdHours) {
			const hoursStr = hoursSince >= 1
				? `${Math.floor(hoursSince)}h ${Math.round((hoursSince % 1) * 60)}m`
				: `${Math.round(hoursSince * 60)}m`;

			return {
				id: 'feeding-overdue',
				category: 'feeding',
				level: hoursSince >= thresholdHours + 1 ? 'urgent' : 'warning',
				title: 'Feeding reminder',
				message: `Last feeding was ${hoursStr} ago (${last.side || 'breast'})`,
				firedAt: now,
			};
		}

		return null;
	}

	private checkMedicationDoses(
		data: PostpartumData,
		settings: NotificationSettings,
		now: number
	): NotificationItem[] {
		const medEntries = (data.trackers.medication || []) as MedicationEntry[];
		const configs = (data.trackers.medicationConfig || DEFAULT_MEDICATIONS) as MedicationConfig[];
		const notifications: NotificationItem[] = [];

		for (const config of configs) {
			if (!config.enabled) continue;
			if (config.notificationEnabled === false) continue;

			// Find last dose of this medication
			const doseEntries = medEntries
				.filter(e => e.name.toLowerCase() === config.name.toLowerCase())
				.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

			if (doseEntries.length === 0) continue;

			const lastDose = doseEntries[doseEntries.length - 1];
			const lastDoseTime = new Date(lastDose.timestamp).getTime();
			const intervalMs = config.minIntervalHours * 3_600_000;
			const safeAt = lastDoseTime + intervalMs;

			// Notify when dose becomes safe (within a 5-minute window after becoming safe)
			if (now >= safeAt && now < safeAt + 5 * 60_000) {
				notifications.push({
					id: `med-ready-${config.name.toLowerCase()}`,
					category: 'medication',
					level: 'info',
					title: `${config.name} ready`,
					message: `${config.name}${config.technicalName ? ` (${config.technicalName})` : ''} is now safe to take`,
					firedAt: now,
				});
			}
		}

		return notifications;
	}

	private checkAlternatingMeds(
		data: PostpartumData,
		now: number
	): NotificationItem | null {
		const medEntries = (data.trackers.medication || []) as MedicationEntry[];
		const configs = (data.trackers.medicationConfig || DEFAULT_MEDICATIONS) as MedicationConfig[];

		const painMeds = configs.filter(c =>
			c.enabled && c.notificationEnabled !== false &&
			['tylenol', 'ibuprofen'].includes(c.name.toLowerCase())
		);
		if (painMeds.length < 2) return null;

		// Find last dose of each pain med
		const lastDoses: { name: string; time: number }[] = [];
		for (const med of painMeds) {
			const entries = medEntries
				.filter(e => e.name.toLowerCase() === med.name.toLowerCase())
				.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			if (entries.length > 0) {
				lastDoses.push({
					name: med.name,
					time: new Date(entries[entries.length - 1].timestamp).getTime(),
				});
			}
		}

		if (lastDoses.length === 0) return null;

		// Find the most recent pain med taken
		lastDoses.sort((a, b) => b.time - a.time);
		const mostRecent = lastDoses[0];
		const otherMed = painMeds.find(m => m.name.toLowerCase() !== mostRecent.name.toLowerCase());
		if (!otherMed) return null;

		// Alternating schedule: other med is safe 3h after the last one
		const alternateAt = mostRecent.time + 3 * 3_600_000;
		if (now >= alternateAt && now < alternateAt + 5 * 60_000) {
			return {
				id: 'med-alternating',
				category: 'medication',
				level: 'info',
				title: 'Alternating medication',
				message: `Time to take ${otherMed.name} (alternating with ${mostRecent.name})`,
				firedAt: now,
			};
		}

		return null;
	}

	private checkSimpleTrackerReminder(
		moduleId: string,
		config: { reminderIntervalHours: number; reminderMessage: string },
		entries: SimpleTrackerEntry[],
		now: number
	): NotificationItem | null {
		if (entries.length === 0) return null;

		const sorted = [...entries].sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
		const last = sorted[sorted.length - 1];
		const hoursSince = (now - new Date(last.timestamp).getTime()) / 3_600_000;

		if (hoursSince >= config.reminderIntervalHours) {
			return {
				id: `simple-reminder-${moduleId}`,
				category: moduleId,
				level: 'info',
				title: config.reminderMessage,
				message: `Last logged ${Math.floor(hoursSince)}h ago`,
				firedAt: now,
			};
		}

		return null;
	}

	// ── Notification Dispatching ──

	private fireNotification(notif: NotificationItem, settings: NotificationSettings): void {
		const { type } = settings;
		const todoistService = this.plugin.todoistService;
		const suppressToasts = todoistService?.shouldSuppressToasts() ?? false;

		// In-app toast (suppressed if Todoist is handling reminders)
		if (!suppressToasts && (type === 'in-app' || type === 'both')) {
			this.toast.show(notif, {
				onDismiss: () => this.dismiss(notif.id),
				onSnooze: (min) => this.snooze(notif.id, min),
			});
		}

		// System notification (desktop only, Web Notification API)
		if (type === 'system' || type === 'both') {
			this.fireSystemNotification(notif);
		}

		// Push notification services (multiple can be active simultaneously)
		if (settings.webhookEnabled) {
			// ntfy
			if (this.isNtfyActive(settings)) {
				this.fireNtfy(notif, settings.ntfyTopic);
			}

			// Pushover
			if (this.isPushoverActive(settings)) {
				this.firePushover(notif, settings);
			}

			// Gotify
			if (settings.gotifyEnabled && settings.gotifyUrl) {
				this.fireGotify(notif, settings.gotifyUrl);
			}

			// Custom webhook
			if (settings.customWebhookEnabled && settings.webhookUrl) {
				this.fireWebhook(notif, settings.webhookUrl);
			}

			// Legacy fallback: if no per-service toggles are on but webhookUrl exists,
			// the user may have upgraded from the old single-preset model
			if (!settings.ntfyEnabled && !settings.pushoverEnabled && !settings.gotifyEnabled && !settings.customWebhookEnabled) {
				// Route based on legacy webhookPreset
				if (settings.webhookPreset === 'pushover' && settings.pushoverAppToken && settings.pushoverUserKey) {
					this.firePushover(notif, settings);
				} else if (settings.webhookUrl) {
					this.fireWebhook(notif, settings.webhookUrl);
				}
			}
		}

		// Todoist: create alert task
		todoistService?.onNotificationFired(notif);
	}

	private fireSystemNotification(notif: NotificationItem): void {
		if (!('Notification' in window)) return;

		if (Notification.permission === 'granted') {
			const notification = new window.Notification(notif.title, {
				body: notif.message,
				tag: `pt-${notif.id}`,
			});
			notification.onclick = () => {
				// Focus Obsidian window
				window.focus();
				notification.close();
			};
		} else if (Notification.permission !== 'denied') {
			Notification.requestPermission();
		}
	}

	/**
	 * Send notification via ntfy.sh.
	 * JSON publishing must POST to the server root with `topic` in the body.
	 * Posting JSON to a topic URL causes ntfy to display raw JSON as plain text.
	 */
	private async fireNtfy(notif: NotificationItem, topic: string, serverUrl = 'https://ntfy.sh'): Promise<void> {
		try {
			const priorityMap: Record<string, number> = { info: 2, warning: 3, urgent: 5 };
			const tags = NotificationService.ntfyTagsForCategory(notif.category, notif.level);

			await fetch(serverUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					topic,
					title: notif.title,
					message: notif.message,
					priority: priorityMap[notif.level] ?? 3,
					...(tags.length ? { tags } : {}),
				}),
			});
		} catch (e) {
			console.warn('Postpartum Tracker: ntfy notification failed', e);
		}
	}

	/**
	 * Send notification via Gotify.
	 * Gotify expects { title, message, priority } at <server>/message.
	 */
	private async fireGotify(notif: NotificationItem, url: string): Promise<void> {
		try {
			const priorityMap: Record<string, number> = { info: 2, warning: 5, urgent: 8 };
			// Gotify URL should end in /message; append if missing
			const endpoint = url.endsWith('/message') ? url : url.replace(/\/?$/, '/message');

			await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: notif.title,
					message: notif.message,
					priority: priorityMap[notif.level] ?? 2,
				}),
			});
		} catch (e) {
			console.warn('Postpartum Tracker: Gotify notification failed', e);
		}
	}

	/**
	 * Send notification via custom webhook (generic JSON payload).
	 */
	private async fireWebhook(notif: NotificationItem, url: string): Promise<void> {
		try {
			await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: notif.title,
					message: notif.message,
					level: notif.level,
					category: notif.category,
					plugin: 'obsidian-postpartum-tracker',
				}),
			});
		} catch (e) {
			console.warn('Postpartum Tracker: webhook failed', e);
		}
	}

	/**
	 * Send a notification via Pushover API.
	 * Emergency priority (urgent) retries until acknowledged — works as an alarm on both Android and iOS.
	 */
	private async firePushover(notif: NotificationItem, settings: NotificationSettings): Promise<void> {
		try {
			// Pushover priority: -2 (silent) to 2 (emergency/retry-until-ack)
			const priorityMap: Record<string, number> = { info: 0, warning: 1, urgent: 2 };
			const priority = priorityMap[notif.level] ?? 0;

			const body: Record<string, string | number> = {
				token: settings.pushoverAppToken,
				user: settings.pushoverUserKey,
				title: notif.title,
				message: notif.message,
				priority,
			};

			// Emergency priority requires retry + expire
			if (priority === 2) {
				body.retry = 60;   // Retry every 60 seconds
				body.expire = 3600; // Stop after 1 hour if not acknowledged
				body.sound = 'persistent'; // Alarm-style sound
			}

			await fetch('https://api.pushover.net/1/messages.json', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: Object.entries(body).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'),
			});
		} catch (e) {
			console.warn('Postpartum Tracker: Pushover notification failed', e);
		}
	}

	/** Check if ntfy is actively configured. */
	private isNtfyActive(settings: NotificationSettings): boolean {
		return settings.ntfyEnabled && !!settings.ntfyTopic;
	}

	/** Check if Pushover is actively configured. */
	private isPushoverActive(settings: NotificationSettings): boolean {
		return settings.pushoverEnabled && !!settings.pushoverAppToken && !!settings.pushoverUserKey;
	}

	/** Extract ntfy topic from a URL path (e.g., https://ntfy.sh/my-topic → 'my-topic'). */
	static extractNtfyTopic(url: string): string | undefined {
		try {
			const parts = new URL(url).pathname.split('/').filter(Boolean);
			if (parts.length === 1 && parts[0] !== 'message') return parts[0];
		} catch { /* invalid URL */ }
		return undefined;
	}

	/** Map notification category + level to ntfy emoji tags. */
	private static ntfyTagsForCategory(category: string, level: string): string[] {
		const tags: string[] = [];
		switch (category) {
			case 'feeding': tags.push('baby_bottle'); break;
			case 'medication': tags.push('pill'); break;
			case 'diaper': tags.push('baby'); break;
			default: tags.push('bell'); break;
		}
		if (level === 'urgent') tags.push('warning', 'rotating_light');
		return tags;
	}

	// ── Scheduled ntfy (Offline Alarm Support) ──

	/**
	 * Schedule a future ntfy notification using the `In` header.
	 * The ntfy server holds the message and delivers it at the specified delay,
	 * even if Obsidian is no longer running.
	 */
	async scheduleNtfyReminder(
		title: string,
		message: string,
		delaySec: number,
		priority: number,
		category: string,
	): Promise<void> {
		const settings = this.getSettings();
		if (!settings.webhookEnabled || !settings.scheduleNtfyOnLog) return;
		if (delaySec <= 0) return;

		const topic = settings.ntfyTopic;
		if (!topic) return;
		const tags = NotificationService.ntfyTagsForCategory(category, priority >= 5 ? 'urgent' : 'warning');

		try {
			// JSON publishing must POST to server root with topic in body
			await fetch('https://ntfy.sh', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'In': `${Math.round(delaySec)}s`,
				},
				body: JSON.stringify({
					topic,
					title,
					message,
					priority,
					...(tags.length ? { tags } : {}),
				}),
			});
		} catch (e) {
			console.warn('Postpartum Tracker: scheduled ntfy failed', e);
		}
	}

	/**
	 * Called when a tracker event is logged. Schedules a future ntfy reminder
	 * based on the event type and the user's notification settings.
	 */
	async scheduleFollowUpFromEvent(event: TrackerEvent & { module?: string }): Promise<void> {
		const settings = this.getSettings();
		if (!settings.webhookEnabled) return;

		// Check which services are active (both can be enabled simultaneously)
		const isNtfy = this.isNtfyActive(settings) ||
			(!settings.ntfyEnabled && !settings.pushoverEnabled && !settings.gotifyEnabled && !settings.customWebhookEnabled &&
			 (settings.webhookPreset === 'ntfy' || !settings.webhookPreset) && !!settings.webhookUrl);
		const isPushover = this.isPushoverActive(settings) ||
			(!settings.ntfyEnabled && !settings.pushoverEnabled && !settings.gotifyEnabled && !settings.customWebhookEnabled &&
			 settings.webhookPreset === 'pushover' && !!settings.pushoverAppToken && !!settings.pushoverUserKey);

		// Determine what to schedule
		let title = '';
		let message = '';
		let delaySec = 0;
		let priority = 4;
		let category = '';

		if (event.type === 'feeding-logged' && settings.feedingReminderEnabled) {
			const effectiveHours = settings.feedingReminderOverride > 0
				? settings.feedingReminderOverride
				: getDynamicFeedingIntervalHours(undefined);
			title = 'Time to feed';
			message = `It has been ${effectiveHours}h since the last feeding`;
			delaySec = effectiveHours * 3600;
			priority = 5;
			category = 'feeding';
		} else if (event.type === 'medication-logged') {
			const config = event.config as MedicationConfig | undefined;
			if (config && config.minIntervalHours > 0 && settings.medDoseReadyEnabled) {
				title = `Safe to take ${config.name}`;
				message = `${config.minIntervalHours}h have passed since your last dose of ${config.name}`;
				delaySec = config.minIntervalHours * 3600;
				priority = 4;
				category = 'medication';
			}
		} else if (event.type === 'simple-logged' && event.module) {
			const def = TRACKER_LIBRARY.find(d => d.id === event.module);
			if (def?.notificationConfig?.reminderEnabled) {
				const hours = def.notificationConfig.reminderIntervalHours;
				title = def.notificationConfig.reminderMessage;
				message = `Last logged ${hours}h ago`;
				delaySec = hours * 3600;
				priority = 4;
				category = event.module;
			}
		}

		if (!title || delaySec <= 0) return;

		// ntfy: schedule server-side (works offline)
		if (isNtfy && settings.scheduleNtfyOnLog) {
			await this.scheduleNtfyReminder(title, message, delaySec, priority, category);
		}

		// Pushover: schedule in-process (only works while Obsidian is open;
		// for offline coverage, user should also enable Todoist with due dates)
		if (isPushover && settings.pushoverAppToken && settings.pushoverUserKey) {
			window.setTimeout(() => {
				const notif: NotificationItem = {
					id: `scheduled-${category}-${Date.now()}`,
					category,
					level: priority >= 5 ? 'urgent' : priority >= 4 ? 'warning' : 'info',
					title,
					message,
					firedAt: Date.now(),
				};
				this.firePushover(notif, this.getSettings());
			}, delaySec * 1000);
		}
	}

	// ── Vault Data Scanner ──

	/**
	 * Find the most recent postpartum-tracker code block data in the vault.
	 * Scans markdown files for ```postpartum-tracker blocks and parses the JSON.
	 */
	private async scanVaultForData(): Promise<PostpartumData | null> {
		const files = this.plugin.app.vault.getMarkdownFiles();

		for (const file of files) {
			const content = await this.plugin.app.vault.cachedRead(file);
			const match = content.match(/```postpartum-tracker\n([\s\S]*?)\n```/);
			if (match && match[1]) {
				try {
					const parsed = JSON.parse(match[1].trim());
					// Basic validation
					if (parsed && parsed.trackers) {
						return parsed as PostpartumData;
					}
				} catch {
					// Invalid JSON, skip
				}
			}
		}

		return null;
	}

	// ── Status Bar ──

	private updateStatusBar(): void {
		if (!this.statusBarEl) return;

		const count = this.activeNotifications.size;
		if (count === 0) {
			this.statusBarEl.textContent = '';
			this.statusBarEl.title = 'No active alerts';
		} else {
			this.statusBarEl.textContent = `\uD83D\uDD14 ${count}`;
			this.statusBarEl.title = `${count} active alert${count > 1 ? 's' : ''}`;
		}
	}

	// ── Snooze Persistence ──

	private loadSnoozeState(): void {
		try {
			const raw = localStorage.getItem(NotificationService.SNOOZE_KEY);
			if (raw) this.snoozeState = JSON.parse(raw);
		} catch {
			this.snoozeState = {};
		}
	}

	private saveSnoozeState(): void {
		try {
			localStorage.setItem(NotificationService.SNOOZE_KEY, JSON.stringify(this.snoozeState));
		} catch { /* silent */ }
	}

	private cleanSnoozeState(): void {
		const now = Date.now();
		let changed = false;
		for (const [id, until] of Object.entries(this.snoozeState)) {
			if (until <= now) {
				delete this.snoozeState[id];
				changed = true;
			}
		}
		if (changed) this.saveSnoozeState();
	}

	private getSettings(): NotificationSettings {
		return this.plugin.settings.notifications;
	}
}
