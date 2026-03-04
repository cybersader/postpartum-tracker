/**
 * ToastNotification — In-app popup notification for the postpartum tracker.
 * Renders a dismissible toast at the bottom-right of the Obsidian window.
 * Works on both desktop and mobile (no dependency on Web Notification API).
 */

import type PostpartumTrackerPlugin from '../main';
import type { NotificationItem } from '../types';

interface ToastCallbacks {
	onDismiss: () => void;
	onSnooze: (minutes: number) => void;
}

const SNOOZE_OPTIONS = [
	{ label: '15 min', minutes: 15 },
	{ label: '30 min', minutes: 30 },
	{ label: '1 hour', minutes: 60 },
	{ label: '2 hours', minutes: 120 },
];

export class ToastNotification {
	private plugin: PostpartumTrackerPlugin;
	private containerEl: HTMLElement | null = null;
	private toastEls: Map<string, HTMLElement> = new Map();

	constructor(plugin: PostpartumTrackerPlugin) {
		this.plugin = plugin;
	}

	/** Show a toast for the given notification. */
	show(notif: NotificationItem, callbacks: ToastCallbacks): void {
		this.ensureContainer();

		// Don't duplicate
		if (this.toastEls.has(notif.id)) return;

		const toast = document.createElement('div');
		toast.className = `pt-toast pt-toast--${notif.level}`;
		toast.dataset.notifId = notif.id;

		// Icon based on category
		const icon = this.getCategoryIcon(notif.category);

		// Header row: icon + title + close
		const header = document.createElement('div');
		header.className = 'pt-toast-header';

		const iconEl = document.createElement('span');
		iconEl.className = 'pt-toast-icon';
		iconEl.textContent = icon;
		header.appendChild(iconEl);

		const titleEl = document.createElement('span');
		titleEl.className = 'pt-toast-title';
		titleEl.textContent = notif.title;
		header.appendChild(titleEl);

		const closeBtn = document.createElement('button');
		closeBtn.className = 'pt-toast-close';
		closeBtn.textContent = '\u2715';
		closeBtn.title = 'Dismiss';
		closeBtn.addEventListener('click', () => {
			this.removeToast(notif.id);
			callbacks.onDismiss();
		});
		header.appendChild(closeBtn);

		toast.appendChild(header);

		// Message
		const msgEl = document.createElement('div');
		msgEl.className = 'pt-toast-message';
		msgEl.textContent = notif.message;
		toast.appendChild(msgEl);

		// Action row: snooze dropdown + dismiss
		const actions = document.createElement('div');
		actions.className = 'pt-toast-actions';

		// Snooze button with dropdown
		const snoozeBtn = document.createElement('button');
		snoozeBtn.className = 'pt-toast-btn pt-toast-btn--snooze';
		snoozeBtn.textContent = 'Snooze';
		snoozeBtn.addEventListener('click', () => {
			// Toggle snooze dropdown
			const existing = toast.querySelector('.pt-toast-snooze-menu');
			if (existing) {
				existing.remove();
				return;
			}
			const menu = document.createElement('div');
			menu.className = 'pt-toast-snooze-menu';
			for (const opt of SNOOZE_OPTIONS) {
				const item = document.createElement('button');
				item.className = 'pt-toast-snooze-item';
				item.textContent = opt.label;
				item.addEventListener('click', () => {
					this.removeToast(notif.id);
					callbacks.onSnooze(opt.minutes);
				});
				menu.appendChild(item);
			}
			toast.appendChild(menu);
		});
		actions.appendChild(snoozeBtn);

		const dismissBtn = document.createElement('button');
		dismissBtn.className = 'pt-toast-btn pt-toast-btn--dismiss';
		dismissBtn.textContent = 'Got it';
		dismissBtn.addEventListener('click', () => {
			this.removeToast(notif.id);
			callbacks.onDismiss();
		});
		actions.appendChild(dismissBtn);

		toast.appendChild(actions);

		// Animate in
		toast.style.opacity = '0';
		toast.style.transform = 'translateX(20px)';
		this.containerEl!.appendChild(toast);
		this.toastEls.set(notif.id, toast);

		requestAnimationFrame(() => {
			toast.style.transition = 'opacity 0.3s, transform 0.3s';
			toast.style.opacity = '1';
			toast.style.transform = 'translateX(0)';
		});
	}

	/** Remove a toast by id with animation. */
	private removeToast(id: string): void {
		const toast = this.toastEls.get(id);
		if (!toast) return;

		toast.style.transition = 'opacity 0.2s, transform 0.2s';
		toast.style.opacity = '0';
		toast.style.transform = 'translateX(20px)';

		setTimeout(() => {
			toast.remove();
			this.toastEls.delete(id);
			// Remove container if empty
			if (this.toastEls.size === 0 && this.containerEl) {
				this.containerEl.remove();
				this.containerEl = null;
			}
		}, 200);
	}

	/** Ensure the toast container exists in the DOM. */
	private ensureContainer(): void {
		if (this.containerEl && document.body.contains(this.containerEl)) return;

		// Clean up any orphaned containers from previous plugin instances (hot-reload)
		document.querySelectorAll('.pt-toast-container').forEach(el => el.remove());

		this.containerEl = document.createElement('div');
		this.containerEl.className = 'pt-toast-container';
		document.body.appendChild(this.containerEl);
	}

	private getCategoryIcon(category: string): string {
		switch (category) {
			case 'feeding': return '\uD83C\uDF7C'; // baby bottle
			case 'medication': return '\uD83D\uDC8A'; // pill
			case 'diaper': return '\uD83D\uDC76'; // baby
			default: return '\uD83D\uDD14'; // bell
		}
	}

	/** Remove all toasts and container (including any orphaned ones). */
	destroy(): void {
		this.toastEls.clear();
		if (this.containerEl) {
			this.containerEl.remove();
			this.containerEl = null;
		}
		// Also remove any orphaned containers from previous instances
		document.querySelectorAll('.pt-toast-container').forEach(el => el.remove());
	}
}
