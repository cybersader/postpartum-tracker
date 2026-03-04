/**
 * DOM helper utilities for creating widget elements.
 * Uses Obsidian-compatible patterns (createEl, createDiv, etc.).
 */

/** Create a div with optional class and text content. */
export function div(
	parent: HTMLElement,
	cls?: string,
	text?: string
): HTMLDivElement {
	const el = parent.createDiv({ cls: cls || undefined });
	if (text) el.textContent = text;
	return el;
}

/** Create a button element. */
export function button(
	parent: HTMLElement,
	text: string,
	cls?: string,
	onClick?: () => void
): HTMLButtonElement {
	const btn = parent.createEl('button', { cls: cls || undefined, text });
	if (onClick) btn.addEventListener('click', onClick);
	return btn;
}

/** Create a span with optional class and text. */
export function span(
	parent: HTMLElement,
	cls?: string,
	text?: string
): HTMLSpanElement {
	const el = parent.createEl('span', { cls: cls || undefined });
	if (text) el.textContent = text;
	return el;
}

/** Trigger haptic feedback if supported and enabled. */
export function haptic(durationMs: number = 50): void {
	if (typeof navigator !== 'undefined' && navigator.vibrate) {
		navigator.vibrate(durationMs);
	}
}
