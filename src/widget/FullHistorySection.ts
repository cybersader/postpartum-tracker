/**
 * Full history section: shows ALL entries grouped by day, going back N days.
 * Unlike EventHistorySection (recent activity, limited by entryWindowHours),
 * this shows a complete day-by-day breakdown for debugging and verification.
 */
import type { PostpartumTrackerSettings } from '../types';
import type { TrackerRegistry } from '../data/TrackerRegistry';
import { formatTime, formatDurationShort } from '../utils/formatters';

export class FullHistorySection {
	private el: HTMLElement;
	private registry: TrackerRegistry;
	private settings: PostpartumTrackerSettings;

	constructor(
		parent: HTMLElement,
		registry: TrackerRegistry,
		settings: PostpartumTrackerSettings,
	) {
		this.registry = registry;
		this.settings = settings;
		this.el = parent.createDiv({ cls: 'pt-full-history' });
	}

	refresh(): void {
		this.el.empty();
		const days = this.settings.fullHistoryDays ?? 7;

		// Collect all entries from all modules
		interface AggEntry {
			moduleId: string;
			icon: string;
			moduleName: string;
			timestamp: string;
			text: string;
			subtext?: string;
		}

		const all: AggEntry[] = [];

		for (const module of this.registry.getAll()) {
			if (!this.settings.enabledModules.includes(module.id)) continue;
			const rawEntries = module.serializeEntries();
			if (!Array.isArray(rawEntries)) continue;

			for (const raw of rawEntries) {
				const entry = raw as Record<string, unknown>;
				const ts = (entry.start || entry.timestamp) as string | undefined;
				if (!ts) continue;
				// Skip active timers
				if (entry.end === null) continue;

				all.push({
					moduleId: module.id,
					icon: module.icon || '',
					moduleName: module.displayName,
					timestamp: ts,
					text: this.buildText(module.displayName, entry),
					subtext: this.buildSubtext(entry),
				});
			}
		}

		// Sort newest first
		all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

		// Group by day
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - days);
		cutoff.setHours(0, 0, 0, 0);
		const cutoffMs = cutoff.getTime();

		const byDay = new Map<string, AggEntry[]>();
		for (const entry of all) {
			const d = new Date(entry.timestamp);
			if (d.getTime() < cutoffMs) continue;
			const dayKey = entry.timestamp.slice(0, 10);
			if (!byDay.has(dayKey)) byDay.set(dayKey, []);
			byDay.get(dayKey)!.push(entry);
		}

		if (byDay.size === 0) {
			this.el.createDiv({ cls: 'pt-full-history-empty', text: 'No entries in this period' });
			return;
		}

		// Render day groups
		const sortedDays = Array.from(byDay.keys()).sort().reverse();
		const today = new Date().toISOString().slice(0, 10);
		const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

		for (const dayKey of sortedDays) {
			const entries = byDay.get(dayKey)!;
			const dayLabel = dayKey === today ? 'Today'
				: dayKey === yesterday ? 'Yesterday'
				: new Date(dayKey + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

			// Day header with counts
			const counts = new Map<string, number>();
			for (const e of entries) {
				counts.set(e.moduleName, (counts.get(e.moduleName) || 0) + 1);
			}
			const countStr = Array.from(counts.entries())
				.map(([name, n]) => `${n} ${name.toLowerCase()}`)
				.join(', ');

			const dayGroup = this.el.createDiv({ cls: 'pt-full-history-day' });
			const header = dayGroup.createDiv({ cls: 'pt-full-history-day-header' });
			header.createSpan({ cls: 'pt-full-history-day-label', text: dayLabel });
			header.createSpan({ cls: 'pt-full-history-day-counts', text: countStr });

			// Entry rows
			const list = dayGroup.createDiv({ cls: 'pt-full-history-entries' });
			for (const e of entries) {
				const row = list.createDiv({ cls: 'pt-full-history-entry' });
				row.createSpan({ cls: 'pt-full-history-time', text: formatTime(e.timestamp, this.settings.timeFormat) });
				row.createSpan({ cls: 'pt-full-history-icon', text: e.icon });
				const textEl = row.createSpan({ cls: 'pt-full-history-text', text: e.text });
				if (e.subtext) {
					textEl.createSpan({ cls: 'pt-full-history-subtext', text: ` · ${e.subtext}` });
				}
			}
		}
	}

	private buildText(moduleName: string, entry: Record<string, unknown>): string {
		const parts: string[] = [];
		if (entry.side) parts.push(String(entry.side));
		if (entry.type && entry.type !== 'breast') parts.push(String(entry.type));
		if (entry.wet) parts.push('wet');
		if (entry.dirty) parts.push('dirty');
		if (entry.color) parts.push(String(entry.color).replace(/-/g, ' '));
		if (entry.name) parts.push(String(entry.name));
		if (entry.dosage) parts.push(String(entry.dosage));
		if (entry.volumeMl) parts.push(`${entry.volumeMl}ml`);

		const fields = entry.fields as Record<string, unknown> | undefined;
		if (fields) {
			for (const [, v] of Object.entries(fields)) {
				if (v !== '' && v !== null && v !== undefined && v !== false) {
					parts.push(String(v));
				}
			}
		}

		return parts.length > 0 ? parts.join(' · ') : moduleName;
	}

	private buildSubtext(entry: Record<string, unknown>): string | undefined {
		const parts: string[] = [];
		if (entry.durationSec) {
			const sec = Number(entry.durationSec);
			if (sec > 0) parts.push(formatDurationShort(sec));
		}
		const notes = (entry.notes || entry.description) as string | undefined;
		if (notes) parts.push(notes);
		return parts.length > 0 ? parts.join(' · ') : undefined;
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
