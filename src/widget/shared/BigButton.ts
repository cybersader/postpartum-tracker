import { haptic } from '../../utils/dom';

/**
 * A large, touch-friendly action button.
 * Configurable label, icon, color class, and click handler.
 */
export class BigButton {
	private el: HTMLButtonElement;
	private hapticEnabled: boolean;

	constructor(
		parent: HTMLElement,
		label: string,
		cls: string,
		onClick: () => void,
		hapticEnabled: boolean = true
	) {
		this.hapticEnabled = hapticEnabled;

		this.el = parent.createEl('button', {
			cls: `pt-big-button ${cls}`,
			text: label,
		});

		this.el.addEventListener('click', () => {
			if (this.hapticEnabled) haptic(50);
			onClick();
		});
	}

	setLabel(label: string): void {
		this.el.textContent = label;
	}

	setDisabled(disabled: boolean): void {
		this.el.disabled = disabled;
	}

	setActive(active: boolean): void {
		if (active) {
			this.el.addClass('pt-big-button--active');
		} else {
			this.el.removeClass('pt-big-button--active');
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
