/**
 * Reusable collapsible section component.
 * Wraps content with a chevron + title header, optional badge,
 * and persists open/closed state in localStorage.
 * Optionally shows up/down arrows for reordering.
 *
 * Uses pointerdown/pointerup events to work reliably inside
 * Obsidian's code block rendering context (CodeMirror 6).
 */
export class CollapsibleSection {
	private el: HTMLElement;
	private headerEl: HTMLElement;
	private bodyEl: HTMLElement;
	private chevronEl: HTMLElement;
	private badgeEl: HTMLElement | null = null;
	private moveControls: HTMLElement | null = null;
	private expanded: boolean;
	private storageKey: string;

	constructor(
		parent: HTMLElement,
		title: string,
		id: string,
		defaultExpanded: boolean = true,
		badgeText?: string
	) {
		this.storageKey = `pt-collapse-${id}`;

		// Read persisted state, fallback to default
		const stored = localStorage.getItem(this.storageKey);
		this.expanded = stored !== null ? stored === '1' : defaultExpanded;

		this.el = parent.createDiv({ cls: 'pt-collapsible' });
		this.el.dataset.sectionId = id;
		this.headerEl = this.el.createDiv({ cls: 'pt-collapsible-header' });

		this.chevronEl = this.headerEl.createSpan({ cls: 'pt-collapsible-chevron' });
		this.chevronEl.textContent = this.expanded ? '\u25BC' : '\u25B6';

		this.headerEl.createSpan({ cls: 'pt-collapsible-title', text: title });

		if (badgeText) {
			this.badgeEl = this.headerEl.createSpan({ cls: 'pt-collapsible-badge', text: badgeText });
		}

		this.bodyEl = this.el.createDiv({ cls: 'pt-collapsible-body' });
		if (!this.expanded) this.bodyEl.addClass('pt-hidden');

		// Use pointerdown to prevent CodeMirror from eating the event
		this.headerEl.addEventListener('pointerdown', (e) => {
			const target = e.target as HTMLElement;
			if (target.closest('.pt-move-controls')) return;
			if (target.closest('.pt-drag-handle')) return;
			e.preventDefault();
			e.stopPropagation();
		});

		this.headerEl.addEventListener('pointerup', (e) => {
			const target = e.target as HTMLElement;
			if (target.closest('.pt-move-controls')) return;
			if (target.closest('.pt-drag-handle')) return;
			e.preventDefault();
			e.stopPropagation();
			this.toggle();
		});

		// Fallback for reading mode
		this.headerEl.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (target.closest('.pt-move-controls')) return;
			if (target.closest('.pt-drag-handle')) return;
			e.stopPropagation();
			this.toggle();
		});
	}

	/** Add up/down move arrows to the header. */
	enableMove(onMoveUp: () => void, onMoveDown: () => void): void {
		if (this.moveControls) return;

		this.moveControls = this.headerEl.createDiv({ cls: 'pt-move-controls' });

		const upBtn = this.moveControls.createEl('button', {
			cls: 'pt-move-btn pt-move-btn--up',
			title: 'Move up',
		});
		upBtn.textContent = '\u25B2';
		this.addButtonHandler(upBtn, onMoveUp);

		const downBtn = this.moveControls.createEl('button', {
			cls: 'pt-move-btn pt-move-btn--down',
			title: 'Move down',
		});
		downBtn.textContent = '\u25BC';
		this.addButtonHandler(downBtn, onMoveDown);
	}

	/** Update which arrows are enabled based on position. */
	setMoveEnabled(canMoveUp: boolean, canMoveDown: boolean): void {
		if (!this.moveControls) return;
		const up = this.moveControls.querySelector('.pt-move-btn--up') as HTMLButtonElement;
		const down = this.moveControls.querySelector('.pt-move-btn--down') as HTMLButtonElement;
		if (up) up.disabled = !canMoveUp;
		if (down) down.disabled = !canMoveDown;
	}

	/** Returns the container element for child content. */
	getBodyEl(): HTMLElement {
		return this.bodyEl;
	}

	/** Returns the root element of the collapsible. */
	getEl(): HTMLElement {
		return this.el;
	}

	/** Toggle expanded/collapsed state. */
	toggle(): void {
		this.expanded = !this.expanded;
		this.chevronEl.textContent = this.expanded ? '\u25BC' : '\u25B6';
		if (this.expanded) {
			this.bodyEl.removeClass('pt-hidden');
		} else {
			this.bodyEl.addClass('pt-hidden');
		}
		localStorage.setItem(this.storageKey, this.expanded ? '1' : '0');
	}

	/** Update the badge text. */
	setBadge(text: string): void {
		if (!this.badgeEl) {
			this.badgeEl = this.headerEl.createSpan({ cls: 'pt-collapsible-badge', text });
		} else {
			this.badgeEl.textContent = text;
		}
	}

	/** Remove the badge. */
	clearBadge(): void {
		if (this.badgeEl) {
			this.badgeEl.remove();
			this.badgeEl = null;
		}
	}

	/** Programmatically expand the section. */
	expand(): void {
		if (!this.expanded) this.toggle();
	}

	/** Programmatically collapse the section. */
	collapse(): void {
		if (this.expanded) this.toggle();
	}

	isExpanded(): boolean {
		return this.expanded;
	}

	/** Add a drag handle for pointer-based reordering. */
	enableDrag(onReorder: (direction: -1 | 1) => void): void {
		const handle = this.headerEl.createDiv({ cls: 'pt-drag-handle' });
		handle.textContent = '\u2807';

		let startY = 0;
		let dragging = false;

		handle.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			startY = e.clientY;
			dragging = true;
			this.el.addClass('pt-dragging');
			handle.setPointerCapture(e.pointerId);
		});

		handle.addEventListener('pointermove', (e) => {
			if (!dragging) return;
			const delta = e.clientY - startY;
			if (Math.abs(delta) > 30) {
				onReorder(delta < 0 ? -1 : 1);
				startY = e.clientY;
			}
		});

		const endDrag = () => {
			dragging = false;
			this.el.removeClass('pt-dragging');
		};

		handle.addEventListener('pointerup', endDrag);
		handle.addEventListener('pointercancel', endDrag);
	}

	/** Hide or show the entire section. */
	setVisible(visible: boolean): void {
		if (visible) {
			this.el.removeClass('pt-hidden');
		} else {
			this.el.addClass('pt-hidden');
		}
	}

	/**
	 * Robust button handler that works inside Obsidian code blocks.
	 * Uses pointerdown + pointerup to prevent CodeMirror from eating events.
	 */
	private addButtonHandler(el: HTMLElement, handler: () => void): void {
		el.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		});

		el.addEventListener('pointerup', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			handler();
		});

		el.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			handler();
		});
	}
}
