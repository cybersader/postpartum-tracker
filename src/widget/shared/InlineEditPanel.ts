/**
 * Inline edit panel for editing entry fields (timestamp, notes, etc.)
 * Replaces prompt() with a proper inline UI that works well on mobile.
 * Uses FieldRenderer for rich, tappable field components.
 */

import { renderField } from './FieldRenderer';

export interface EditField {
	key: string;
	label: string;
	type: 'datetime' | 'date' | 'text' | 'number' | 'select' | 'rating' | 'boolean';
	value: string;
	options?: { value: string; label: string }[];
	placeholder?: string;
	min?: string;
	max?: string;
	unit?: string;
}

export class InlineEditPanel {
	private el: HTMLElement;
	private valueAccessors: Map<string, () => string> = new Map();

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

		// Render fields using shared FieldRenderer
		const fieldsContainer = this.el.createDiv({ cls: 'pt-edit-fields' });
		for (const field of fields) {
			const getValue = renderField(fieldsContainer, field);
			this.valueAccessors.set(field.key, getValue);
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
			for (const [key, getValue] of this.valueAccessors) {
				values[key] = getValue();
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

	destroy(): void {
		this.el.remove();
	}

	getEl(): HTMLElement {
		return this.el;
	}

	private addButtonHandler(el: HTMLElement, handler: () => void): void {
		let handledByPointer = false;
		el.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		});
		el.addEventListener('pointerup', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			handledByPointer = true;
			handler();
			setTimeout(() => { handledByPointer = false; }, 0);
		});
		el.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			if (!handledByPointer) handler();
		});
	}
}
