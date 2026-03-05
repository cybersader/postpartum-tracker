import type { ButtonSize, TimerAnimation, QuickAction } from '../types';
import { haptic } from '../utils/dom';

/**
 * Top-level quick action button area.
 * Collects big buttons from all registered modules and renders them
 * in a responsive grid. Includes a clock toggle for logging past entries.
 */
export class QuickActions {
	private el: HTMLElement;
	private hapticEnabled: boolean;
	private showLabels: boolean;
	private buttonSize: ButtonSize;
	private buttonColumns: number;
	private timerAnimation: TimerAnimation;
	private buttonEls: Map<string, HTMLButtonElement> = new Map();
	private btnRow: HTMLElement | null = null;

	// Clock / past-time state
	private clockActive = false;
	private datetimeInput: HTMLInputElement | null = null;
	private clockToggle: HTMLButtonElement | null = null;
	private clockRow: HTMLElement | null = null;

	constructor(parent: HTMLElement, hapticEnabled: boolean, showLabels: boolean = true, buttonSize: ButtonSize = 'normal', buttonColumns: number = 0, timerAnimation: TimerAnimation = 'pulse') {
		this.el = parent.createDiv({ cls: 'pt-quick-actions' });
		this.hapticEnabled = hapticEnabled;
		this.showLabels = showLabels;
		this.buttonSize = buttonSize;
		this.buttonColumns = buttonColumns;
		this.timerAnimation = timerAnimation;
	}

	/** Render all quick action buttons from the provided actions. */
	render(actions: QuickAction[]): void {
		this.el.empty();
		this.buttonEls.clear();
		this.clockActive = false;

		// Clock row (datetime picker, hidden by default)
		this.clockRow = this.el.createDiv({ cls: 'pt-clock-row pt-hidden' });
		this.clockRow.createSpan({ cls: 'pt-clock-label', text: 'Log time:' });
		this.datetimeInput = this.clockRow.createEl('input', {
			cls: 'pt-clock-input',
			attr: { type: 'datetime-local' },
		});
		this.datetimeInput.value = this.toLocalNow();

		// Prevent CodeMirror from eating input interactions
		this.datetimeInput.addEventListener('pointerdown', (e) => e.stopPropagation());
		this.datetimeInput.addEventListener('mousedown', (e) => e.stopPropagation());

		// Button grid
		const btnRow = this.el.createDiv({ cls: 'pt-quick-actions-buttons' });
		this.btnRow = btnRow;
		if (!this.showLabels) btnRow.addClass('pt-labels-hidden');
		if (this.buttonSize !== 'normal') btnRow.addClass(`pt-btn-${this.buttonSize}`);
		if (this.buttonColumns > 0) {
			btnRow.style.gridTemplateColumns = `repeat(${this.buttonColumns}, 1fr)`;
		}
		// Timer animation variant
		btnRow.dataset.timerAnim = this.timerAnimation;

		// Clock toggle button
		this.clockToggle = btnRow.createEl('button', {
			cls: 'pt-quick-btn pt-quick-btn--clock',
		});
		this.clockToggle.createSpan({ cls: 'pt-quick-btn-icon', text: '\uD83D\uDD52' });
		this.clockToggle.createSpan({ cls: 'pt-quick-btn-label', text: 'Past' });

		this.addActionHandler(this.clockToggle, () => {
			this.clockActive = !this.clockActive;
			if (this.clockActive) {
				this.clockRow!.removeClass('pt-hidden');
				this.clockToggle!.addClass('pt-quick-btn--active');
				// Reset to now
				if (this.datetimeInput) {
					this.datetimeInput.value = this.toLocalNow();
				}
			} else {
				this.clockRow!.addClass('pt-hidden');
				this.clockToggle!.removeClass('pt-quick-btn--active');
			}
		});

		// Module action buttons
		for (const action of actions) {
			const btn = btnRow.createEl('button', {
				cls: `pt-quick-btn ${action.cls}`,
			});
			if (action.labelEssential) btn.addClass('pt-label-essential');
			btn.createSpan({ cls: 'pt-quick-btn-icon', text: action.icon });

			// Support sublabel via newline in label text
			const parts = action.label.split('\n');
			btn.createSpan({ cls: 'pt-quick-btn-label', text: parts[0] });
			if (parts[1]) {
				btn.createSpan({ cls: 'pt-quick-btn-sublabel', text: parts[1] });
			}

			this.addActionHandler(btn, () => {
				if (this.hapticEnabled) haptic(50);
				const ts = this.getSelectedTimestamp();
				action.onClick(ts);

				// Auto-disable clock after use
				if (this.clockActive) {
					this.clockActive = false;
					this.clockRow!.addClass('pt-hidden');
					this.clockToggle!.removeClass('pt-quick-btn--active');
				}
			});

			this.buttonEls.set(action.id, btn);
		}
	}

	/** Get the selected past timestamp, or undefined if clock is not active. */
	private getSelectedTimestamp(): string | undefined {
		if (!this.clockActive || !this.datetimeInput) return undefined;
		const val = this.datetimeInput.value;
		if (!val) return undefined;
		const d = new Date(val);
		return isNaN(d.getTime()) ? undefined : d.toISOString();
	}

	/** Get current time as datetime-local input value. */
	private toLocalNow(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	/** Set a button's disabled state. */
	setDisabled(actionId: string, disabled: boolean): void {
		const btn = this.buttonEls.get(actionId);
		if (btn) btn.disabled = disabled;
	}

	/** Set a button's active/highlighted state. */
	setActive(actionId: string, active: boolean): void {
		const btn = this.buttonEls.get(actionId);
		if (!btn) return;
		if (active) {
			btn.addClass('pt-quick-btn--active');
		} else {
			btn.removeClass('pt-quick-btn--active');
		}
	}

	getEl(): HTMLElement {
		return this.el;
	}

	/** Robust button handler for code block context. */
	private addActionHandler(el: HTMLElement, handler: () => void): void {
		let handledByPointer = false;

		el.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			e.stopPropagation();
		});
		el.addEventListener('pointerup', (e) => {
			e.preventDefault();
			e.stopPropagation();
			handledByPointer = true;
			handler();
			// Reset after current event cycle so click doesn't double-fire
			setTimeout(() => { handledByPointer = false; }, 0);
		});
		// Fallback for non-pointer environments (keyboard, accessibility)
		el.addEventListener('click', (e) => {
			e.stopPropagation();
			if (!handledByPointer) handler();
		});
	}
}
