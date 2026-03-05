/**
 * Manages the Obsidian status bar item with live tracker context.
 *
 * Modes:
 *   'badge' — alert count only (default NotificationService behavior)
 *   'live'  — shows time since last feed, active timers, alert count
 *   'off'   — hidden
 */
import type PostpartumTrackerPlugin from './main';
import type { FeedingEntry, SimpleTrackerEntry } from './types';
import { filterToday } from './data/dateUtils';

export class StatusBarManager {
	private el: HTMLElement;
	private plugin: PostpartumTrackerPlugin;
	private intervalId: ReturnType<typeof setInterval> | null = null;

	constructor(el: HTMLElement, plugin: PostpartumTrackerPlugin) {
		this.el = el;
		this.plugin = plugin;
	}

	start(): void {
		this.update();
		// Update every 30 seconds for live mode
		this.intervalId = setInterval(() => this.update(), 30_000);
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	update(): void {
		const mode = this.plugin.settings.statusBarMode;

		if (mode === 'off') {
			this.el.textContent = '';
			this.el.style.display = 'none';
			return;
		}

		this.el.style.display = '';

		if (mode === 'badge') {
			// Badge mode: handled by NotificationService already
			return;
		}

		// Live mode: show rich context
		const parts: string[] = [];

		// Last feed time
		const feedAgo = this.getLastFeedAgo();
		if (feedAgo) parts.push(`Feed: ${feedAgo}`);

		// Active timers
		const activeTimers = this.getActiveTimers();
		if (activeTimers.length > 0) {
			parts.push(activeTimers.join(', '));
		}

		// Alert count
		const alertCount = this.plugin.notificationService?.getActive().length || 0;
		if (alertCount > 0) {
			parts.push(`\uD83D\uDD14 ${alertCount}`);
		}

		if (parts.length > 0) {
			this.el.textContent = parts.join(' \u2502 ');
			this.el.title = 'Postpartum Tracker';
		} else {
			this.el.textContent = '\uD83D\uDC76';
			this.el.title = 'Postpartum Tracker — no activity today';
		}
	}

	private getLastFeedAgo(): string | null {
		try {
			const store = this.plugin.store;
			if (!store) return null;

			// We need to find feeding data from the most recent widget
			// The simplest approach: read from the registry's feeding module
			const feedingModule = this.plugin.registry.get('feeding');
			if (!feedingModule) return null;

			// Access serialized data — modules keep their entries in memory
			const entries = feedingModule.serializeEntries() as FeedingEntry[];
			const completed = entries.filter(e => e.end !== null);
			if (completed.length === 0) return null;

			const last = completed[completed.length - 1];
			const diffMin = Math.floor((Date.now() - new Date(last.end!).getTime()) / 60_000);
			if (diffMin < 1) return 'just now';
			if (diffMin < 60) return `${diffMin}m ago`;
			const h = Math.floor(diffMin / 60);
			const m = diffMin % 60;
			return m === 0 ? `${h}h ago` : `${h}h${m}m ago`;
		} catch {
			return null;
		}
	}

	private getActiveTimers(): string[] {
		const active: string[] = [];
		try {
			for (const module of this.plugin.registry.getAll()) {
				const entries = module.serializeEntries();
				if (!Array.isArray(entries)) continue;
				for (const entry of entries) {
					const e = entry as SimpleTrackerEntry;
					if (e.end === null && e.timestamp) {
						const elapsed = Math.floor((Date.now() - new Date(e.timestamp).getTime()) / 60_000);
						active.push(`${module.displayName}: ${elapsed}m`);
					}
				}
			}
		} catch {
			// Ignore errors
		}
		return active;
	}
}
