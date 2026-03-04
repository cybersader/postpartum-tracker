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
} from '../types';
import { EMPTY_DATA, DEFAULT_MEDICATIONS } from '../types';
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
	private async check(): Promise<void> {
		const settings = this.getSettings();
		if (!settings.enabled) return;

		// Clean expired snoozes
		this.cleanSnoozeState();

		// Find and parse the most recent tracker data from vault
		const data = await this.scanVaultForData();
		if (!data) return;

		const now = Date.now();
		const notifications: NotificationItem[] = [];

		// Feeding reminder
		if (settings.feedingReminderEnabled) {
			const feedingAlert = this.checkFeedingReminder(data, settings, now);
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
		settings: NotificationSettings,
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

		if (hoursSince >= settings.feedingReminderHours) {
			const hoursStr = hoursSince >= 1
				? `${Math.floor(hoursSince)}h ${Math.round((hoursSince % 1) * 60)}m`
				: `${Math.round(hoursSince * 60)}m`;

			return {
				id: 'feeding-overdue',
				category: 'feeding',
				level: hoursSince >= 4 ? 'urgent' : 'warning',
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
			c.enabled && ['tylenol', 'ibuprofen'].includes(c.name.toLowerCase())
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

		// Webhook
		if (settings.webhookEnabled && settings.webhookUrl) {
			this.fireWebhook(notif, settings.webhookUrl);
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

	private async fireWebhook(notif: NotificationItem, url: string): Promise<void> {
		try {
			await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: notif.title,
					message: notif.message,
					priority: notif.level === 'urgent' ? 8 : notif.level === 'warning' ? 5 : 3,
					extras: {
						category: notif.category,
						plugin: 'obsidian-postpartum-tracker',
					},
				}),
			});
		} catch (e) {
			console.warn('Postpartum Tracker: webhook failed', e);
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
