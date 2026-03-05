/**
 * Quick entry section: text input with NLP parsing + preview.
 * Positioned before the tracker sections in the widget.
 */

import type { TrackerModule } from '../trackers/BaseTracker';
import type { PostpartumTrackerSettings, TrackerEvent } from '../types';
import type { TrackerRegistry } from '../data/TrackerRegistry';
import { QuickEntryParser, type ParsedEntry } from '../nlp/QuickEntryParser';
import { generateId } from '../utils/formatters';

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

		const clearBtn = btnRow.createEl('button', {
			cls: 'pt-quick-entry-clear',
			text: 'Clear',
		});
		clearBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
		clearBtn.addEventListener('click', () => this.clear());
	}

	private onInput(): void {
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
			this.hidePreview();
			return;
		}

		this.currentParsed = parsed;
		this.showPreview(parsed);
	}

	private showPreview(parsed: ParsedEntry): void {
		if (!this.previewEl) return;

		this.previewEl.empty();
		this.previewEl.removeClass('pt-hidden');

		// Module icon + name
		const module = this.registry.get(parsed.moduleId);
		const icon = module?.icon || '';
		const moduleName = module?.displayName || parsed.moduleId;

		const headerEl = this.previewEl.createDiv({ cls: 'pt-quick-entry-preview-header' });
		headerEl.createSpan({ text: icon ? `${icon} ` : '' });
		headerEl.createSpan({ cls: 'pt-quick-entry-preview-module', text: moduleName });
		headerEl.createSpan({ text: ' \u2014 ' });
		headerEl.createSpan({ cls: 'pt-quick-entry-preview-summary', text: parsed.summary });

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

		// Route through addEntry if available
		if (module.addEntry) {
			module.addEntry(parsed.data);
		}

		this.clear();
		await this.save();
	}

	private clear(): void {
		if (this.inputEl) this.inputEl.value = '';
		this.hidePreview();
	}
}
