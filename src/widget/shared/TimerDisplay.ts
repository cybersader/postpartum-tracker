import { formatDuration } from '../../utils/formatters';

/**
 * Live timer display showing elapsed time.
 * Simplified version for the postpartum tracker (no pause overlay).
 */
export class TimerDisplay {
	private el: HTMLElement;
	private timeEl: HTMLElement;
	private labelEl: HTMLElement;

	constructor(parent: HTMLElement) {
		this.el = parent.createDiv({ cls: 'pt-timer-display' });
		this.labelEl = this.el.createDiv({ cls: 'pt-timer-label' });
		this.timeEl = this.el.createDiv({ cls: 'pt-timer-time' });
		this.timeEl.textContent = '0:00';
	}

	/** Update the displayed time in seconds. */
	update(seconds: number, label?: string): void {
		this.timeEl.textContent = formatDuration(seconds);
		if (label !== undefined) {
			this.labelEl.textContent = label;
		}
	}

	setLabel(label: string): void {
		this.labelEl.textContent = label;
	}

	setActive(active: boolean): void {
		if (active) {
			this.el.addClass('pt-timer-display--active');
		} else {
			this.el.removeClass('pt-timer-display--active');
		}
	}

	setVisible(visible: boolean): void {
		if (visible) {
			this.el.removeClass('pt-hidden');
		} else {
			this.el.addClass('pt-hidden');
		}
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
