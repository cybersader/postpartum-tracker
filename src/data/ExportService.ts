/**
 * Export tracker data to Markdown tables or CSV.
 */
import type PostpartumTrackerPlugin from '../main';
import type { TrackerModule } from '../trackers/BaseTracker';
import { formatTime } from '../utils/formatters';

export class ExportService {
	private plugin: PostpartumTrackerPlugin;

	constructor(plugin: PostpartumTrackerPlugin) {
		this.plugin = plugin;
	}

	/** Export all tracker data as a Markdown string with tables per module. */
	exportMarkdown(): string {
		const lines: string[] = [];
		lines.push(`# Postpartum Tracker Export`);
		lines.push(`Exported: ${new Date().toLocaleString()}\n`);

		for (const module of this.plugin.registry.getAll()) {
			const entries = module.serializeEntries();
			if (!Array.isArray(entries) || entries.length === 0) continue;

			lines.push(`## ${module.displayName}\n`);
			const { headers, rows } = this.entriesToTable(entries);
			if (headers.length === 0) continue;

			// Markdown table header
			lines.push('| ' + headers.join(' | ') + ' |');
			lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');

			for (const row of rows) {
				lines.push('| ' + row.join(' | ') + ' |');
			}
			lines.push('');
		}

		return lines.join('\n');
	}

	/** Export all tracker data as CSV string. */
	exportCsv(): string {
		const allRows: string[][] = [];
		let maxCols = 0;

		for (const module of this.plugin.registry.getAll()) {
			const entries = module.serializeEntries();
			if (!Array.isArray(entries) || entries.length === 0) continue;

			const { headers, rows } = this.entriesToTable(entries);
			if (headers.length === 0) continue;

			const headerRow = ['Module', ...headers];
			if (allRows.length === 0) {
				allRows.push(headerRow);
			}
			maxCols = Math.max(maxCols, headerRow.length);

			for (const row of rows) {
				allRows.push([module.displayName, ...row]);
			}
		}

		return allRows.map(row =>
			row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
		).join('\n');
	}

	/** Convert raw entries to a flat table (headers + rows of strings). */
	private entriesToTable(entries: unknown[]): { headers: string[]; rows: string[][] } {
		if (entries.length === 0) return { headers: [], rows: [] };

		// Collect all keys from all entries
		const keySet = new Set<string>();
		for (const entry of entries) {
			if (typeof entry !== 'object' || entry === null) continue;
			const rec = entry as Record<string, unknown>;
			for (const key of Object.keys(rec)) {
				if (key === 'id') continue; // Skip internal ID
				if (key === 'fields') {
					// Flatten fields object
					const fields = rec.fields as Record<string, unknown> | undefined;
					if (fields) {
						for (const fk of Object.keys(fields)) {
							keySet.add(`fields.${fk}`);
						}
					}
				} else {
					keySet.add(key);
				}
			}
		}

		const headers = Array.from(keySet);
		const rows: string[][] = [];

		for (const entry of entries) {
			if (typeof entry !== 'object' || entry === null) continue;
			const rec = entry as Record<string, unknown>;
			const row: string[] = [];
			for (const key of headers) {
				if (key.startsWith('fields.')) {
					const fieldKey = key.slice(7);
					const fields = rec.fields as Record<string, unknown> | undefined;
					row.push(fields ? String(fields[fieldKey] ?? '') : '');
				} else {
					row.push(String(rec[key] ?? ''));
				}
			}
			rows.push(row);
		}

		return { headers, rows };
	}
}
