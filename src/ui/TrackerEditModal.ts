/**
 * Modal-based edit panel for tracker entries.
 * Same field types as InlineEditPanel, but rendered as a centered Obsidian modal.
 * Uses FieldRenderer for rich, tappable field components.
 */
import { App, Modal } from 'obsidian';
import type { EditField } from '../widget/shared/InlineEditPanel';
import { renderField } from '../widget/shared/FieldRenderer';

export class TrackerEditModal extends Modal {
	private title: string;
	private editFields: EditField[];
	private onSaveCb: (values: Record<string, string>) => void;
	private onCancelCb: (() => void) | undefined;
	private valueAccessors: Map<string, () => string> = new Map();

	constructor(
		app: App,
		title: string,
		fields: EditField[],
		onSave: (values: Record<string, string>) => void,
		onCancel?: () => void
	) {
		super(app);
		this.title = title;
		this.editFields = fields;
		this.onSaveCb = onSave;
		this.onCancelCb = onCancel;
	}

	/**
	 * Defer opening to the next animation frame so the pointer/mouse event
	 * chain fully settles before the modal backdrop becomes visible.
	 * On mobile, the browser synthesises delayed mouseup/click events ~300ms
	 * after touchend; if the backdrop is already present, those events can
	 * trigger Obsidian's "click outside modal" detection and immediately close it.
	 */
	open(): void {
		requestAnimationFrame(() => super.open());
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('pt-modal-edit');

		contentEl.createEl('h3', { text: this.title });

		// Render fields using shared FieldRenderer
		const fieldsContainer = contentEl.createDiv({ cls: 'pt-modal-fields' });
		for (const field of this.editFields) {
			const getValue = renderField(fieldsContainer, field);
			this.valueAccessors.set(field.key, getValue);
		}

		// Buttons
		const btnRow = contentEl.createDiv({ cls: 'pt-modal-buttons' });
		const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
		const saveBtn = btnRow.createEl('button', { text: 'Save', cls: 'mod-cta' });

		cancelBtn.addEventListener('click', () => {
			this.onCancelCb?.();
			this.close();
		});

		saveBtn.addEventListener('click', () => {
			const values: Record<string, string> = {};
			for (const [key, getValue] of this.valueAccessors) {
				values[key] = getValue();
			}
			// Close modal BEFORE save to prevent re-render race condition
			this.close();
			this.onSaveCb(values);
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
