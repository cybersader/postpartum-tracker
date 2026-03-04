/**
 * Inline edit panel for editing entry fields (timestamp, notes, etc.)
 * Replaces prompt() with a proper inline UI that works well on mobile.
 * Uses datetime-local inputs which trigger native OS pickers.
 */

export interface EditField {
	key: string;
	label: string;
	type: 'datetime' | 'date' | 'text' | 'number' | 'select';
	value: string;
	options?: { value: string; label: string }[];
	placeholder?: string;
	min?: string;
	max?: string;
}

export class InlineEditPanel {
	private el: HTMLElement;
	private fields: Map<string, HTMLInputElement | HTMLSelectElement> = new Map();

	constructor(
		parent: HTMLElement,
		title: string,
		fields: EditField[],
		onSave: (values: Record<string, string>) => void,
		onCancel: () => void,
		insertAtTop = true
	) {
		this.el = document.createElement('div');
		this.el.addClass('pt-edit-panel');

		if (insertAtTop && parent.firstChild) {
			parent.insertBefore(this.el, parent.firstChild);
		} else {
			parent.appendChild(this.el);
		}

		this.el.createDiv({ cls: 'pt-edit-panel-title', text: title });

		for (const field of fields) {
			const row = this.el.createDiv({ cls: 'pt-edit-field' });
			row.createEl('label', { cls: 'pt-edit-label', text: field.label });

			if (field.type === 'datetime') {
				const input = row.createEl('input', {
					cls: 'pt-edit-input',
					attr: { type: 'datetime-local' },
				});
				input.value = this.toLocalDatetime(field.value);
				this.fields.set(field.key, input);
			} else if (field.type === 'date') {
				const input = row.createEl('input', {
					cls: 'pt-edit-input',
					attr: { type: 'date' },
				});
				input.value = this.toLocalDate(field.value);
				this.fields.set(field.key, input);
			} else if (field.type === 'number') {
				const attrs: Record<string, string> = { type: 'number' };
				if (field.min) attrs.min = field.min;
				if (field.max) attrs.max = field.max;
				if (field.placeholder) attrs.placeholder = field.placeholder;
				const input = row.createEl('input', {
					cls: 'pt-edit-input',
					attr: attrs,
				});
				input.value = field.value;
				this.fields.set(field.key, input);
			} else if (field.type === 'select') {
				const select = row.createEl('select', { cls: 'pt-edit-select' });
				for (const opt of field.options || []) {
					const optEl = select.createEl('option', {
						text: opt.label,
						attr: { value: opt.value },
					});
					if (opt.value === field.value) optEl.selected = true;
				}
				this.fields.set(field.key, select);
			} else {
				const input = row.createEl('input', {
					cls: 'pt-edit-input',
					attr: {
						type: 'text',
						placeholder: field.placeholder || '',
					},
				});
				input.value = field.value;
				this.fields.set(field.key, input);
			}
		}

		// Buttons
		const btnRow = this.el.createDiv({ cls: 'pt-edit-buttons' });
		const saveBtn = btnRow.createEl('button', {
			cls: 'pt-edit-save',
			text: 'Save',
		});
		const cancelBtn = btnRow.createEl('button', {
			cls: 'pt-edit-cancel',
			text: 'Cancel',
		});

		this.addButtonHandler(saveBtn, () => {
			const values: Record<string, string> = {};
			for (const [key, inputEl] of this.fields) {
				if (inputEl instanceof HTMLInputElement && inputEl.type === 'datetime-local') {
					const d = new Date(inputEl.value);
					values[key] = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
				} else if (inputEl instanceof HTMLInputElement && inputEl.type === 'date') {
					values[key] = inputEl.value; // Keep as YYYY-MM-DD
				} else {
					values[key] = inputEl.value;
				}
			}
			onSave(values);
		});

		this.addButtonHandler(cancelBtn, () => {
			onCancel();
		});

		// Prevent text inputs from triggering CodeMirror editing
		this.el.addEventListener('pointerdown', (e) => {
			const target = e.target as HTMLElement;
			if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
				e.stopPropagation();
			}
		});
		this.el.addEventListener('mousedown', (e) => {
			const target = e.target as HTMLElement;
			if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
				e.stopPropagation();
			}
		});
	}

	/** Convert ISO string to local datetime-local input value. */
	private toLocalDatetime(iso: string): string {
		const d = new Date(iso);
		if (isNaN(d.getTime())) return this.toLocalDatetime(new Date().toISOString());
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	/** Convert ISO string to date input value (YYYY-MM-DD). */
	private toLocalDate(iso: string): string {
		const d = new Date(iso);
		if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	destroy(): void {
		this.el.remove();
	}

	getEl(): HTMLElement {
		return this.el;
	}

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
