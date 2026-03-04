import type { HealthAlert } from '../types';

/**
 * Panel displaying health alerts collected from all modules.
 * Hides when no alerts are active.
 */
export class AlertsPanel {
	private el: HTMLElement;

	constructor(parent: HTMLElement) {
		this.el = parent.createDiv({ cls: 'pt-alerts-panel pt-hidden' });
	}

	/** Render alerts. Hides the panel if no alerts. */
	render(alerts: HealthAlert[]): void {
		this.el.empty();
		if (alerts.length === 0) {
			this.el.addClass('pt-hidden');
			return;
		}
		this.el.removeClass('pt-hidden');

		for (const alert of alerts) {
			const alertEl = this.el.createDiv({
				cls: `pt-alert pt-alert--${alert.level}`,
			});
			const icon = alert.level === 'urgent' ? '\u26A0' : alert.level === 'warning' ? '\u26A0' : '\u2139';
			alertEl.createSpan({ cls: 'pt-alert-icon', text: icon });
			alertEl.createSpan({ cls: 'pt-alert-message', text: alert.message });
			if (alert.detail) {
				alertEl.createDiv({ cls: 'pt-alert-detail', text: alert.detail });
			}
		}
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
