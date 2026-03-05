/**
 * History modal — shows past tracker entries grouped by day.
 */
import { App, Modal } from 'obsidian';
import type PostpartumTrackerPlugin from '../main';
import { formatTime } from '../utils/formatters';

export class HistoryModal extends Modal {
	private plugin: PostpartumTrackerPlugin;

	constructor(app: App, plugin: PostpartumTrackerPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('pt-history-modal');
		contentEl.createEl('h2', { text: 'Tracker history' });

		// Collect all entries from all modules grouped by day
		const dayMap = new Map<string, { module: string; time: string; text: string }[]>();

		for (const module of this.plugin.registry.getAll()) {
			const entries = module.serializeEntries();
			if (!Array.isArray(entries)) continue;

			for (const rawEntry of entries) {
				const entry = rawEntry as Record<string, unknown>;
				const ts = (entry.start || entry.timestamp) as string | undefined;
				if (!ts) continue;

				const d = new Date(ts);
				if (isNaN(d.getTime())) continue;

				const dayKey = d.toISOString().split('T')[0];
				const time = formatTime(ts, this.plugin.settings.timeFormat);

				// Build display text
				const parts: string[] = [];
				if (entry.type) parts.push(String(entry.type));
				if (entry.side) parts.push(String(entry.side));
				if (entry.wet) parts.push('wet');
				if (entry.dirty) parts.push('dirty');
				if (entry.name) parts.push(String(entry.name));
				if (entry.durationSec) {
					const min = Math.round(Number(entry.durationSec) / 60);
					if (min > 0) parts.push(`${min}m`);
				}
				if (entry.volumeMl) parts.push(`${entry.volumeMl}ml`);

				const fields = entry.fields as Record<string, unknown> | undefined;
				if (fields) {
					for (const [k, v] of Object.entries(fields)) {
						if (v !== '' && v !== null && v !== undefined) {
							parts.push(`${k}: ${v}`);
						}
					}
				}

				const notes = (entry.notes || entry.description) as string | undefined;
				if (notes) parts.push(notes);

				if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
				dayMap.get(dayKey)!.push({
					module: module.displayName,
					time,
					text: parts.join(' \u2022 ') || 'entry',
				});
			}
		}

		if (dayMap.size === 0) {
			contentEl.createEl('p', { text: 'No entries yet.', cls: 'pt-history-empty' });
			return;
		}

		// Sort days descending
		const sortedDays = Array.from(dayMap.keys()).sort().reverse();

		for (const day of sortedDays) {
			const dayLabel = new Date(day + 'T12:00:00').toLocaleDateString(undefined, {
				weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
			});
			contentEl.createEl('h3', { text: dayLabel, cls: 'pt-history-day-header' });

			const items = dayMap.get(day)!;
			// Sort by time within day
			items.sort((a, b) => a.time.localeCompare(b.time));

			const list = contentEl.createEl('div', { cls: 'pt-history-day-list' });
			for (const item of items) {
				const row = list.createDiv({ cls: 'pt-history-entry' });
				row.createSpan({ cls: 'pt-history-time', text: item.time });
				row.createSpan({ cls: 'pt-history-module', text: item.module });
				row.createSpan({ cls: 'pt-history-text', text: item.text });
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
