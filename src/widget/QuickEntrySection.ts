/**
 * Quick entry section: text input with NLP parsing + preview.
 * Positioned before the tracker sections in the widget.
 */

import type { TrackerModule } from '../trackers/BaseTracker';
import type { PostpartumTrackerSettings, TrackerEvent } from '../types';
import type { TrackerRegistry } from '../data/TrackerRegistry';
import { QuickEntryParser, type ParsedEntry } from '../nlp/QuickEntryParser';
import { generateId, formatTime } from '../utils/formatters';

export class QuickEntrySection {
	private container: HTMLElement;
	private registry: TrackerRegistry;
	private settings: PostpartumTrackerSettings;
	private save: () => Promise<void>;
	private emitEvent: (event: TrackerEvent) => void;
	private medNames: string[];

	private inputEl: HTMLInputElement | null = null;
	private previewEl: HTMLElement | null = null;
	private confirmBtn: HTMLButtonElement | null = null;
	private clearXBtn: HTMLButtonElement | null = null;
	private currentParsed: ParsedEntry | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		parent: HTMLElement,
		registry: TrackerRegistry,
		settings: PostpartumTrackerSettings,
		save: () => Promise<void>,
		emitEvent: (event: TrackerEvent) => void,
		medNames: string[]
	) {
		this.registry = registry;
		this.settings = settings;
		this.save = save;
		this.emitEvent = emitEvent;
		this.medNames = medNames;

		this.container = parent.createDiv({ cls: 'pt-quick-entry' });
		this.build();
	}

	private build(): void {
		const inputRow = this.container.createDiv({ cls: 'pt-quick-entry-input-row' });

		// Clear button (× on the left)
		this.clearXBtn = inputRow.createEl('button', {
			cls: 'pt-quick-entry-clear-x pt-hidden',
			text: '×',
		});
		const clearBtn = this.clearXBtn;
		clearBtn.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		});
		clearBtn.addEventListener('pointerup', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			this.clear();
			if (this.inputEl) this.inputEl.focus();
		});

		this.inputEl = inputRow.createEl('input', {
			cls: 'pt-quick-entry-input',
			attr: {
				type: 'text',
				placeholder: 'e.g. "fed left 20 min" or "wet diaper"',
			},
		});

		// Prevent CodeMirror from stealing focus
		this.inputEl.addEventListener('pointerdown', (e) => {
			e.stopPropagation();
		});
		this.inputEl.addEventListener('mousedown', (e) => {
			e.stopPropagation();
		});
		this.inputEl.addEventListener('touchstart', (e) => {
			e.stopPropagation();
		});

		this.inputEl.addEventListener('input', () => this.onInput());
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && this.currentParsed) {
				e.preventDefault();
				this.confirm();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.clear();
			}
		});

		this.previewEl = this.container.createDiv({ cls: 'pt-quick-entry-preview pt-hidden' });

		const btnRow = this.container.createDiv({ cls: 'pt-quick-entry-buttons pt-hidden' });
		this.confirmBtn = btnRow.createEl('button', {
			cls: 'pt-quick-entry-confirm',
			text: 'Log entry',
		});
		this.confirmBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
		this.confirmBtn.addEventListener('click', () => this.confirm());

		const clearBtnRow = btnRow.createEl('button', {
			cls: 'pt-quick-entry-clear',
			text: 'Clear',
		});
		clearBtnRow.addEventListener('pointerdown', (e) => e.stopPropagation());
		clearBtnRow.addEventListener('click', () => this.clear());
	}

	private onInput(): void {
		// Show/hide × clear button
		const hasText = !!(this.inputEl?.value);
		if (this.clearXBtn) {
			if (hasText) this.clearXBtn.removeClass('pt-hidden');
			else this.clearXBtn.addClass('pt-hidden');
		}
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => this.parseAndPreview(), 150);
	}

	private parseAndPreview(): void {
		const text = this.inputEl?.value.trim() || '';
		if (!text) {
			this.hidePreview();
			return;
		}

		const enabledIds = this.settings.enabledModules;
		const parser = new QuickEntryParser(enabledIds, this.medNames);
		const parsed = parser.parse(text);

		if (!parsed) {
			// No NLP match — hide preview but keep Clear button visible
			this.currentParsed = null;
			this.previewEl?.addClass('pt-hidden');
			this.previewEl?.empty();
			// Show buttons row with just Clear (Log entry won't work without parsed data)
			const btnRow = this.container.querySelector('.pt-quick-entry-buttons');
			btnRow?.removeClass('pt-hidden');
			if (this.confirmBtn) this.confirmBtn.addClass('pt-hidden');
			return;
		}

		this.currentParsed = parsed;
		if (this.confirmBtn) this.confirmBtn.removeClass('pt-hidden');
		this.showPreview(parsed);
	}

	private showPreview(parsed: ParsedEntry): void {
		if (!this.previewEl) return;

		this.previewEl.empty();
		this.previewEl.removeClass('pt-hidden');

		// Module icon + name header
		const module = this.registry.get(parsed.moduleId);
		const icon = module?.icon || '';
		const moduleName = module?.displayName || parsed.moduleId;

		const headerEl = this.previewEl.createDiv({ cls: 'pt-quick-entry-preview-header' });
		headerEl.createSpan({ text: icon ? `${icon} ` : '' });
		headerEl.createSpan({ cls: 'pt-quick-entry-preview-module', text: moduleName });
		headerEl.createSpan({ text: ' \u2014 ' });
		headerEl.createSpan({ cls: 'pt-quick-entry-preview-summary', text: parsed.summary });

		// Rich field breakdown
		const fieldsEl = this.previewEl.createDiv({ cls: 'pt-quick-entry-preview-fields' });
		this.renderFieldRows(fieldsEl, parsed);

		// Confidence indicator
		const confCls = `pt-quick-entry-confidence--${parsed.confidence}`;
		this.previewEl.addClass(confCls);
		this.previewEl.removeClass(
			...['high', 'medium', 'low']
				.filter(c => c !== parsed.confidence)
				.map(c => `pt-quick-entry-confidence--${c}`)
		);

		// Show buttons
		const btnRow = this.container.querySelector('.pt-quick-entry-buttons');
		btnRow?.removeClass('pt-hidden');
	}

	/** Render per-module field rows in the preview. */
	private renderFieldRows(el: HTMLElement, parsed: ParsedEntry): void {
		const d = parsed.data;
		const addField = (label: string, value: string) => {
			const row = el.createDiv({ cls: 'pt-quick-entry-field' });
			row.createSpan({ cls: 'pt-quick-entry-field-label', text: label });
			row.createSpan({ cls: 'pt-quick-entry-field-value', text: value });
		};

		// Subtraction action
		if (d.action === 'subtract') {
			addField('Action', 'Subtract from sleep');
			if (d.durationMs) {
				const min = Math.round(Number(d.durationMs) / 60000);
				const h = Math.floor(min / 60);
				const m = min % 60;
				addField('Remove', h > 0 ? `${h}h ${m}m` : `${m}m`);
			}
			// Show time range if both timestamps present
			if (d.timestamp && d.endTimestamp) {
				const fmt = this.settings.timeFormat;
				const startStr = formatTime(d.timestamp as string, fmt);
				const endStr = formatTime(d.endTimestamp as string, fmt);
				addField('From', `${startStr} → ${endStr}`);
			}
			return;
		}

		// Start/stop timer actions (feeding + sleep)
		if (d.startTimer) {
			const module = this.registry.get(parsed.moduleId);
			const label = module?.displayName || parsed.moduleId;
			addField('Action', `Start ${label.toLowerCase()} timer`);
			if (d.side) addField('Side', String(d.side));
			if (d.type) addField('Type', String(d.type));
			if (d.timestamp) {
				const timeStr = formatTime(d.timestamp as string, this.settings.timeFormat);
				const agoMin = Math.round((Date.now() - new Date(d.timestamp as string).getTime()) / 60000);
				const agoStr = agoMin > 0 ? ` (${agoMin}m ago)` : '';
				addField('Start at', timeStr + agoStr);
			} else {
				addField('Start at', 'Now');
			}
			return;
		}
		if (d.stopTimer) {
			const module = this.registry.get(parsed.moduleId);
			const label = module?.displayName || parsed.moduleId;
			addField('Action', `Stop ${label.toLowerCase()} timer`);
			if (d.timestamp) {
				const timeStr = formatTime(d.timestamp as string, this.settings.timeFormat);
				const agoMin = Math.round((Date.now() - new Date(d.timestamp as string).getTime()) / 60000);
				const agoStr = agoMin > 0 ? ` (${agoMin}m ago)` : '';
				addField('Stop at', timeStr + agoStr);
			} else {
				addField('Stop at', 'Now');
			}
			return;
		}

		switch (parsed.moduleId) {
			case 'feeding': {
				if (d.type) addField('Type', String(d.type));
				if (d.side) addField('Side', String(d.side));
				if (d.durationMs) {
					const min = Math.round(Number(d.durationMs) / 60000);
					addField('Duration', `${min}m`);
				}
				if (d.volume) addField('Volume', `${d.volume}${d.volumeUnit || 'ml'}`);
				break;
			}
			case 'diaper': {
				const parts: string[] = [];
				if (d.wet) parts.push('Wet');
				if (d.dirty) parts.push('Dirty');
				if (parts.length) addField('Type', parts.join(' + '));
				if (d.color) addField('Color', String(d.color).replace(/-/g, ' '));
				break;
			}
			case 'sleep': {
				if (d.durationMs) {
					const min = Math.round(Number(d.durationMs) / 60000);
					const h = Math.floor(min / 60);
					const m = min % 60;
					addField('Duration', h > 0 ? `${h}h ${m}m` : `${m}m`);
				}
				break;
			}
			case 'medication': {
				if (d.name) addField('Name', String(d.name));
				if (d.dosage) addField('Dosage', String(d.dosage));
				break;
			}
			default: {
				if (d.durationMs) {
					const min = Math.round(Number(d.durationMs) / 60000);
					addField('Duration', `${min}m`);
				}
				if (d.value) addField('Value', `${d.value}${d.unit ? ' ' + d.unit : ''}`);
				break;
			}
		}

		// Timestamp (shared across all types)
		if (d.timestamp && d.endTimestamp) {
			// Time range (e.g. sleep from 12:30 to 1:30)
			const fmt = this.settings.timeFormat;
			const startStr = formatTime(d.timestamp as string, fmt);
			const endStr = formatTime(d.endTimestamp as string, fmt);
			const startDate = new Date(d.timestamp as string);
			const now = new Date();
			const isYesterday = startDate.getDate() !== now.getDate() || startDate.getMonth() !== now.getMonth();
			const prefix = isYesterday ? 'Yesterday ' : '';
			addField('Time', `${prefix}${startStr} → ${endStr}`);
		} else if (d.timestamp) {
			const ts = new Date(d.timestamp as string);
			const now = new Date();
			const isYesterday = ts.getDate() !== now.getDate() || ts.getMonth() !== now.getMonth();
			const timeStr = formatTime(d.timestamp as string, this.settings.timeFormat);
			addField('Time', isYesterday ? `Yesterday ${timeStr}` : timeStr);
		}
	}

	private hidePreview(): void {
		this.currentParsed = null;
		this.previewEl?.addClass('pt-hidden');
		this.previewEl?.empty();
		const btnRow = this.container.querySelector('.pt-quick-entry-buttons');
		btnRow?.addClass('pt-hidden');
	}

	private async confirm(): Promise<void> {
		if (!this.currentParsed) return;

		const parsed = this.currentParsed;
		const module = this.registry.get(parsed.moduleId);
		if (!module) return;

		if (parsed.data.stopTimer && module.stopActiveTimer) {
			module.stopActiveTimer(parsed.data);
		} else if (parsed.data.action === 'subtract' && module.subtractEntry) {
			module.subtractEntry(parsed.data);
		} else if (module.addEntry) {
			module.addEntry(parsed.data);
		}

		this.clear();
		await this.save();
	}

	private clear(): void {
		if (this.inputEl) this.inputEl.value = '';
		if (this.clearXBtn) this.clearXBtn.addClass('pt-hidden');
		this.hidePreview();
	}
}
