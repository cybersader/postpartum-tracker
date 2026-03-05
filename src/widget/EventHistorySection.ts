/**
 * Unified chronological event feed showing recent entries from all modules.
 * Supports edit/delete routing back to the owning module, plus undo-last.
 */
import type { TrackerModule } from '../trackers/BaseTracker';
import type { PostpartumTrackerSettings } from '../types';
import type { TrackerRegistry } from '../data/TrackerRegistry';
import { formatTime, formatDurationShort } from '../utils/formatters';
import { EntryList, type EntryListItem } from './shared/EntryList';

interface AggregatedEntry {
	moduleId: string;
	moduleName: string;
	moduleIcon: string;
	entryId: string;
	timestamp: string;
	text: string;
	subtext?: string;
}

export class EventHistorySection {
	private el: HTMLElement;
	private entryList: EntryList;
	private undoBtn: HTMLButtonElement | null = null;
	private registry: TrackerRegistry;
	private settings: PostpartumTrackerSettings;
	private lastEntry: AggregatedEntry | null = null;
	private onSave: () => Promise<void>;

	constructor(
		parent: HTMLElement,
		registry: TrackerRegistry,
		settings: PostpartumTrackerSettings,
		onSave: () => Promise<void>
	) {
		this.registry = registry;
		this.settings = settings;
		this.onSave = onSave;

		this.el = parent.createDiv({ cls: 'pt-event-history' });

		// Header row with title and undo button
		const header = this.el.createDiv({ cls: 'pt-event-history-header' });
		header.createSpan({ cls: 'pt-event-history-title', text: 'Recent activity' });

		this.undoBtn = header.createEl('button', {
			cls: 'pt-event-history-undo pt-hidden',
			text: 'Undo last',
		});
		this.addButtonHandler(this.undoBtn, () => this.undoLast());

		// Entry list
		this.entryList = new EntryList(this.el, 'No recent entries');
		this.entryList.setCallbacks(
			(compositeId) => this.routeEdit(compositeId),
			(compositeId) => this.routeDelete(compositeId)
		);
	}

	/** Refresh the feed by aggregating entries from all enabled modules. */
	refresh(): void {
		const entries = this.aggregateEntries();
		this.lastEntry = entries.length > 0 ? entries[0] : null;

		// Show/hide undo button
		if (this.undoBtn) {
			if (this.lastEntry) {
				this.undoBtn.removeClass('pt-hidden');
			} else {
				this.undoBtn.addClass('pt-hidden');
			}
		}

		// Convert to EntryListItems with composite IDs (moduleId::entryId)
		const items: EntryListItem[] = entries.map(e => ({
			id: `${e.moduleId}::${e.entryId}`,
			time: formatTime(e.timestamp, this.settings.timeFormat),
			icon: e.moduleIcon,
			text: e.text,
			subtext: e.subtext,
		}));

		this.entryList.update(items);
	}

	/** Aggregate and sort entries from all enabled modules (newest first). */
	private aggregateEntries(): AggregatedEntry[] {
		const windowHours = this.settings.entryWindowHours ?? 24;
		const now = Date.now();
		const cutoff = windowHours > 0
			? now - windowHours * 60 * 60 * 1000
			: new Date().setHours(0, 0, 0, 0);
		const results: AggregatedEntry[] = [];

		for (const module of this.registry.getAll()) {
			if (!this.settings.enabledModules.includes(module.id)) continue;

			const rawEntries = module.serializeEntries();
			if (!Array.isArray(rawEntries)) continue;

			for (const raw of rawEntries) {
				const entry = raw as Record<string, unknown>;
				const ts = (entry.start || entry.timestamp) as string | undefined;
				if (!ts) continue;

				const d = new Date(ts);
				if (isNaN(d.getTime())) continue;
				if (d.getTime() < cutoff) continue;

				// Skip active timers (entries with end === null and a start)
				if (entry.end === null && entry.start) continue;

				results.push({
					moduleId: module.id,
					moduleName: module.displayName,
					moduleIcon: module.icon || '',
					entryId: (entry.id as string) || '',
					timestamp: ts,
					text: this.buildDisplayText(module, entry),
					subtext: this.buildSubtext(entry),
				});
			}
		}

		// Sort newest first
		results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

		// Limit to 50 entries max
		return results.slice(0, 50);
	}

	/** Build readable display text from a raw entry. */
	private buildDisplayText(module: TrackerModule, entry: Record<string, unknown>): string {
		const parts: string[] = [module.displayName];

		if (entry.type) parts.push(String(entry.type));
		if (entry.side) parts.push(String(entry.side));
		if (entry.wet) parts.push('wet');
		if (entry.dirty) parts.push('dirty');
		if (entry.name) parts.push(String(entry.name));
		if (entry.volumeMl) parts.push(`${entry.volumeMl}ml`);

		const fields = entry.fields as Record<string, unknown> | undefined;
		if (fields) {
			for (const [, v] of Object.entries(fields)) {
				if (v !== '' && v !== null && v !== undefined && v !== false) {
					parts.push(String(v));
				}
			}
		}

		return parts.join(' \u2022 ');
	}

	/** Build subtext (duration, notes). */
	private buildSubtext(entry: Record<string, unknown>): string | undefined {
		const parts: string[] = [];
		if (entry.durationSec) {
			const sec = Number(entry.durationSec);
			if (sec > 0) parts.push(formatDurationShort(sec));
		}
		const notes = (entry.notes || entry.description) as string | undefined;
		if (notes) parts.push(notes);
		return parts.length > 0 ? parts.join(' \u2022 ') : undefined;
	}

	/** Route an edit action to the owning module. */
	private routeEdit(compositeId: string): void {
		const [moduleId, entryId] = compositeId.split('::');
		const module = this.registry.get(moduleId);
		if (module?.editEntry) module.editEntry(entryId);
	}

	/** Route a delete action to the owning module. */
	private async routeDelete(compositeId: string): Promise<void> {
		const [moduleId, entryId] = compositeId.split('::');
		const module = this.registry.get(moduleId);
		if (module?.deleteEntry) await module.deleteEntry(entryId);
	}

	/** Undo the most recent entry. */
	private async undoLast(): Promise<void> {
		if (!this.lastEntry) return;
		const module = this.registry.get(this.lastEntry.moduleId);
		if (module?.deleteEntry) {
			await module.deleteEntry(this.lastEntry.entryId);
		}
	}

	getEl(): HTMLElement {
		return this.el;
	}

	/** Robust button handler for code block context. */
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
