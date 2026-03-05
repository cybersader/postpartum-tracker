/**
 * Scrollable log of recent entries with timestamp, icon, and text.
 * Uses pointerdown events to prevent Obsidian's CodeMirror from
 * intercepting clicks inside rendered code blocks.
 */
export interface EntryListItem {
	id: string;
	time: string;
	icon: string;
	text: string;
	subtext?: string;
	cls?: string;
	/** ISO8601 timestamp for day-separator headers. */
	rawTimestamp?: string;
}

export class EntryList {
	private el: HTMLElement;
	private listEl: HTMLElement;
	private emptyEl: HTMLElement;
	private onEdit?: (id: string) => void;
	private onDelete?: (id: string) => void;

	constructor(parent: HTMLElement, emptyText: string = 'No entries yet') {
		this.el = parent.createDiv({ cls: 'pt-entry-list' });
		this.emptyEl = this.el.createDiv({ cls: 'pt-entry-list-empty', text: emptyText });
		this.listEl = this.el.createDiv({ cls: 'pt-entry-list-items' });
	}

	setCallbacks(onEdit?: (id: string) => void, onDelete?: (id: string) => void): void {
		this.onEdit = onEdit;
		this.onDelete = onDelete;
	}

	update(items: EntryListItem[]): void {
		this.listEl.empty();
		if (items.length === 0) {
			this.emptyEl.removeClass('pt-hidden');
			this.listEl.addClass('pt-hidden');
			return;
		}
		this.emptyEl.addClass('pt-hidden');
		this.listEl.removeClass('pt-hidden');

		let lastDateKey = '';

		// Render in the order given (callers pass newest-first)
		for (const item of items) {
			// Insert day separator when rawTimestamp is provided
			if (item.rawTimestamp) {
				const dateKey = toDateKey(item.rawTimestamp);
				if (dateKey !== lastDateKey) {
					lastDateKey = dateKey;
					const label = dayLabel(dateKey);
					this.listEl.createDiv({ cls: 'pt-entry-day-sep', text: label });
				}
			}

			const row = this.listEl.createDiv({ cls: `pt-entry-row ${item.cls || ''}` });

			row.createSpan({ cls: 'pt-entry-time', text: item.time });
			row.createSpan({ cls: 'pt-entry-icon', text: item.icon });
			const textEl = row.createSpan({ cls: 'pt-entry-text', text: item.text });
			if (item.subtext) {
				textEl.createEl('small', { cls: 'pt-entry-subtext', text: ` ${item.subtext}` });
			}

			// Action buttons -- use pointerdown to prevent CodeMirror from eating clicks
			const actions = row.createDiv({ cls: 'pt-entry-actions' });

			if (this.onEdit) {
				const editBtn = actions.createEl('button', {
					cls: 'pt-entry-action-btn',
					title: 'Edit',
					text: '\u270E',
				});
				this.addButtonHandler(editBtn, () => this.onEdit!(item.id));
			}

			if (this.onDelete) {
				const deleteBtn = actions.createEl('button', {
					cls: 'pt-entry-action-btn pt-entry-action-btn--delete',
					title: 'Delete',
					text: '\u2715',
				});
				this.addButtonHandler(deleteBtn, () => this.onDelete!(item.id));
			}
		}
	}

	/**
	 * Attach a robust click handler that works inside Obsidian's
	 * code block rendering context (CodeMirror 6 Live Preview).
	 * Uses pointerdown + preventDefault to prevent CM from swallowing events.
	 */
	private addButtonHandler(el: HTMLElement, handler: () => void): void {
		let handledByPointer = false;

		// pointerdown fires before CodeMirror can process the event
		el.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		});

		// Block delayed synthetic mouse events (mobile 300ms tap delay) from
		// propagating to document-level listeners (e.g. modal backdrop close)
		el.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		});
		el.addEventListener('mouseup', (e) => {
			e.stopPropagation();
			e.stopImmediatePropagation();
		});

		// Actual action on pointerup (natural "click" feel)
		el.addEventListener('pointerup', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			handledByPointer = true;
			handler();
			// 400ms covers the mobile 300ms tap-to-click delay
			setTimeout(() => { handledByPointer = false; }, 400);
		});

		// Fallback for non-pointer environments (reading mode, keyboard)
		el.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			if (!handledByPointer) handler();
		});
	}

	getEl(): HTMLElement {
		return this.el;
	}
}

/** Local YYYY-MM-DD key for a given ISO timestamp. */
function toDateKey(iso: string): string {
	const d = new Date(iso);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Human-friendly label: "Today", "Yesterday", or "Mon, Mar 3". */
function dayLabel(dateKey: string): string {
	const now = new Date();
	const todayKey = toDateKey(now.toISOString());
	if (dateKey === todayKey) return 'Today';

	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (dateKey === toDateKey(yesterday.toISOString())) return 'Yesterday';

	const d = new Date(dateKey + 'T12:00:00');
	const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
	const month = d.toLocaleDateString(undefined, { month: 'short' });
	const day = d.getDate();
	return `${weekday}, ${month} ${day}`;
}
