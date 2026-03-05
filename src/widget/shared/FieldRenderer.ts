/**
 * Rich field rendering for mobile-optimized input forms.
 * Shared between TrackerEditModal and InlineEditPanel.
 *
 * Maps field types to tappable UI components:
 *   rating  → row of big number circles
 *   select (≤6) → grid of pill buttons
 *   select (>6) → styled dropdown
 *   boolean → toggle switch
 *   number  → input with +/- stepper buttons + unit label
 *   text    → large padded input
 *   datetime/date → native picker (styled larger)
 */

import type { EditField } from './InlineEditPanel';

/** Callback when a field's value changes. */
export type FieldChangeCallback = (key: string, value: string) => void;

/** Convert ISO to local datetime-local value. */
function toLocalDatetime(iso: string): string {
	const d = new Date(iso);
	if (isNaN(d.getTime())) return toLocalDatetime(new Date().toISOString());
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert ISO to date input value (YYYY-MM-DD). */
function toLocalDate(iso: string): string {
	// If already YYYY-MM-DD, return as-is to avoid UTC→local date shift
	if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
	const d = new Date(iso);
	if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Render a single field into the given container.
 * Returns the raw value accessor function: () => currentValue.
 */
export function renderField(
	container: HTMLElement,
	field: EditField,
	onChange?: FieldChangeCallback
): () => string {
	const row = container.createDiv({ cls: 'pt-field-row' });
	row.createEl('label', { cls: 'pt-field-label', text: field.label });

	switch (field.type) {
		case 'rating':
			return renderRating(row, field, onChange);
		case 'boolean':
			return renderBoolean(row, field, onChange);
		case 'select':
			return renderSelect(row, field, onChange);
		case 'number':
			return renderNumber(row, field, onChange);
		case 'datetime':
			return renderDatetime(row, field, onChange);
		case 'date':
			return renderDate(row, field, onChange);
		case 'text':
		default:
			return renderText(row, field, onChange);
	}
}

// ── Rating (tappable number circles) ──

function renderRating(
	row: HTMLElement,
	field: EditField,
	onChange?: FieldChangeCallback
): () => string {
	const min = parseInt(field.min || '1');
	const max = parseInt(field.max || '5');
	const ratingRow = row.createDiv({ cls: 'pt-field-rating-row' });
	let selected = field.value || '';

	const buttons: HTMLButtonElement[] = [];
	for (let i = min; i <= max; i++) {
		const btn = ratingRow.createEl('button', {
			cls: 'pt-field-rating-btn',
			text: String(i),
		});
		if (String(i) === selected) btn.addClass('pt-field-rating-btn--selected');
		buttons.push(btn);

		addTapHandler(btn, () => {
			selected = String(i);
			buttons.forEach((b, idx) => {
				b.toggleClass('pt-field-rating-btn--selected', idx === i - min);
			});
			onChange?.(field.key, selected);
		});
	}

	return () => selected;
}

// ── Boolean (toggle switch) ──

function renderBoolean(
	row: HTMLElement,
	field: EditField,
	onChange?: FieldChangeCallback
): () => string {
	const wrap = row.createDiv({ cls: 'pt-field-toggle-wrap' });
	const checkbox = wrap.createEl('input', {
		cls: 'pt-field-toggle',
		attr: { type: 'checkbox' },
	}) as HTMLInputElement;
	wrap.createSpan({ cls: 'pt-field-toggle-label', text: field.value === 'true' ? 'Yes' : 'No' });

	checkbox.checked = field.value === 'true';

	checkbox.addEventListener('change', () => {
		const label = wrap.querySelector('.pt-field-toggle-label');
		if (label) label.textContent = checkbox.checked ? 'Yes' : 'No';
		onChange?.(field.key, String(checkbox.checked));
	});

	// Prevent CodeMirror from eating events
	wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
	wrap.addEventListener('mousedown', (e) => e.stopPropagation());

	return () => String(checkbox.checked);
}

// ── Select (pill buttons or dropdown) ──

const PILL_THRESHOLD = 6;

function renderSelect(
	row: HTMLElement,
	field: EditField,
	onChange?: FieldChangeCallback
): () => string {
	const options = field.options || [];

	if (options.length <= PILL_THRESHOLD) {
		return renderSelectPills(row, field, options, onChange);
	}
	return renderSelectDropdown(row, field, options, onChange);
}

function renderSelectPills(
	row: HTMLElement,
	field: EditField,
	options: { value: string; label: string }[],
	onChange?: FieldChangeCallback
): () => string {
	const grid = row.createDiv({ cls: 'pt-field-select-grid' });
	let selected = field.value || '';

	const pills: HTMLButtonElement[] = [];
	for (const opt of options) {
		const pill = grid.createEl('button', {
			cls: 'pt-field-select-pill',
			text: opt.label,
		});
		if (opt.value === selected) pill.addClass('pt-field-select-pill--selected');
		pills.push(pill);

		addTapHandler(pill, () => {
			selected = opt.value;
			pills.forEach((p, idx) => {
				p.toggleClass('pt-field-select-pill--selected', options[idx].value === selected);
			});
			onChange?.(field.key, selected);
		});
	}

	return () => selected;
}

function renderSelectDropdown(
	row: HTMLElement,
	field: EditField,
	options: { value: string; label: string }[],
	onChange?: FieldChangeCallback
): () => string {
	const select = row.createEl('select', { cls: 'pt-field-select-dropdown' });

	for (const opt of options) {
		const optEl = select.createEl('option', {
			text: opt.label,
			attr: { value: opt.value },
		});
		if (opt.value === field.value) optEl.selected = true;
	}

	select.addEventListener('change', () => {
		onChange?.(field.key, select.value);
	});

	// Prevent CodeMirror
	select.addEventListener('pointerdown', (e) => e.stopPropagation());
	select.addEventListener('mousedown', (e) => e.stopPropagation());

	return () => select.value;
}

// ── Number (stepper +/- with unit) ──

function renderNumber(
	row: HTMLElement,
	field: EditField,
	onChange?: FieldChangeCallback
): () => string {
	const wrap = row.createDiv({ cls: 'pt-field-number-stepper' });

	const minusBtn = wrap.createEl('button', {
		cls: 'pt-field-stepper-btn',
		text: '\u2212', // minus sign
	});

	const attrs: Record<string, string> = { type: 'number' };
	if (field.min) attrs.min = field.min;
	if (field.max) attrs.max = field.max;
	if (field.placeholder) attrs.placeholder = field.placeholder;
	const input = wrap.createEl('input', {
		cls: 'pt-field-number-input',
		attr: attrs,
	}) as HTMLInputElement;
	input.value = field.value;

	const plusBtn = wrap.createEl('button', {
		cls: 'pt-field-stepper-btn',
		text: '+',
	});

	if (field.unit) {
		wrap.createSpan({ cls: 'pt-field-number-unit', text: field.unit });
	}

	const step = () => {
		const min = field.min ? parseFloat(field.min) : -Infinity;
		const max = field.max ? parseFloat(field.max) : Infinity;
		return { min, max };
	};

	addTapHandler(minusBtn, () => {
		const { min } = step();
		const cur = parseFloat(input.value) || 0;
		const next = Math.max(min, cur - 1);
		input.value = String(next);
		onChange?.(field.key, input.value);
	});

	addTapHandler(plusBtn, () => {
		const { max } = step();
		const cur = parseFloat(input.value) || 0;
		const next = Math.min(max, cur + 1);
		input.value = String(next);
		onChange?.(field.key, input.value);
	});

	input.addEventListener('input', () => {
		onChange?.(field.key, input.value);
	});

	// Prevent CodeMirror
	input.addEventListener('pointerdown', (e) => e.stopPropagation());
	input.addEventListener('mousedown', (e) => e.stopPropagation());

	return () => input.value;
}

// ── Datetime ──

function renderDatetime(
	row: HTMLElement,
	field: EditField,
	onChange?: FieldChangeCallback
): () => string {
	const input = row.createEl('input', {
		cls: 'pt-field-datetime-input',
		attr: { type: 'datetime-local' },
	}) as HTMLInputElement;
	input.value = toLocalDatetime(field.value);

	input.addEventListener('change', () => {
		onChange?.(field.key, input.value);
	});

	input.addEventListener('pointerdown', (e) => e.stopPropagation());
	input.addEventListener('mousedown', (e) => e.stopPropagation());

	return () => {
		const d = new Date(input.value);
		return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
	};
}

// ── Date ──

function renderDate(
	row: HTMLElement,
	field: EditField,
	onChange?: FieldChangeCallback
): () => string {
	const input = row.createEl('input', {
		cls: 'pt-field-date-input',
		attr: { type: 'date' },
	}) as HTMLInputElement;
	input.value = toLocalDate(field.value);

	input.addEventListener('change', () => {
		onChange?.(field.key, input.value);
	});

	input.addEventListener('pointerdown', (e) => e.stopPropagation());
	input.addEventListener('mousedown', (e) => e.stopPropagation());

	return () => input.value;
}

// ── Text ──

function renderText(
	row: HTMLElement,
	field: EditField,
	onChange?: FieldChangeCallback
): () => string {
	const input = row.createEl('input', {
		cls: 'pt-field-text-input',
		attr: { type: 'text', placeholder: field.placeholder || '' },
	}) as HTMLInputElement;
	input.value = field.value;

	input.addEventListener('input', () => {
		onChange?.(field.key, input.value);
	});

	input.addEventListener('pointerdown', (e) => e.stopPropagation());
	input.addEventListener('mousedown', (e) => e.stopPropagation());

	return () => input.value;
}

// ── Tap handler (prevents CodeMirror stealing events) ──

function addTapHandler(el: HTMLElement, handler: () => void): void {
	let handledByPointer = false;
	el.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
	});
	el.addEventListener('mousedown', (e) => {
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
	});
	el.addEventListener('mouseup', (e) => {
		e.stopPropagation();
		e.stopImmediatePropagation();
	});
	el.addEventListener('pointerup', (e) => {
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
		handledByPointer = true;
		handler();
		setTimeout(() => { handledByPointer = false; }, 400);
	});
	el.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
		if (!handledByPointer) handler();
	});
}
