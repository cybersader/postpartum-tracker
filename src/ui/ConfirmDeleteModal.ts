/**
 * Simple confirmation modal shown before deleting a tracker entry.
 * Prevents accidental deletions from mis-taps on mobile.
 */
import { App, Modal } from 'obsidian';

export class ConfirmDeleteModal extends Modal {
	private description: string;
	private onConfirmCb: () => void;

	constructor(app: App, description: string, onConfirm: () => void) {
		super(app);
		this.description = description;
		this.onConfirmCb = onConfirm;
	}

	/** Defer open to next frame to avoid mobile tap-delay closing the modal. */
	open(): void {
		requestAnimationFrame(() => super.open());
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('pt-confirm-delete');

		contentEl.createEl('h3', { text: 'Delete entry?' });

		contentEl.createDiv({
			cls: 'pt-confirm-delete-description',
			text: this.description,
		});

		const btnRow = contentEl.createDiv({ cls: 'pt-modal-buttons' });

		const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const deleteBtn = btnRow.createEl('button', {
			text: 'Delete',
			cls: 'mod-warning',
		});
		deleteBtn.addEventListener('click', () => {
			this.close();
			this.onConfirmCb();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
