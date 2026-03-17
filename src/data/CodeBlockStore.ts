import { App, TFile, MarkdownPostProcessorContext } from 'obsidian';
import type { PostpartumData } from '../types';
import { EMPTY_DATA, DEFAULT_LAYOUT, DEFAULT_MEDICATIONS } from '../types';

/**
 * Handles reading and writing tracker data to/from the code block JSON.
 * Uses ctx.getSectionInfo() to locate the code block and app.vault.process()
 * for atomic read-modify-write operations.
 */
export class CodeBlockStore {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Parse tracker data from code block source text.
	 */
	parse(source: string): PostpartumData {
		try {
			const trimmed = source.trim();
			if (!trimmed) return this.makeEmpty();

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let parsed: any;
			try {
				parsed = JSON.parse(trimmed);
			} catch (jsonErr) {
				// Attempt recovery: sync conflicts can splice two JSON versions together.
				// Try to extract the largest valid JSON prefix.
				console.warn('Postpartum Tracker: JSON parse failed, attempting recovery...', jsonErr);
				parsed = this.attemptJsonRecovery(trimmed);
				if (!parsed) {
					throw jsonErr; // Recovery failed, fall through to outer catch
				}
				console.warn('Postpartum Tracker: recovery succeeded — some entries may be lost from the corrupted region.');
			}

			// Merge saved layout with defaults: preserve all saved IDs, append missing defaults
			let layout: string[] = [...DEFAULT_LAYOUT];
			if (Array.isArray(parsed.layout) && parsed.layout.length > 0) {
				const savedSet = new Set(parsed.layout as string[]);
				const missing = DEFAULT_LAYOUT.filter(id => !savedSet.has(id));
				layout = [...(parsed.layout as string[]), ...missing];
			}

			const trackers = parsed.trackers && typeof parsed.trackers === 'object'
				? parsed.trackers
				: {};

			// Build tracker data: known keys with defaults, then preserve extra keys
			const trackerData: PostpartumData['trackers'] = {
				feeding: Array.isArray(trackers.feeding) ? trackers.feeding : [],
				diaper: Array.isArray(trackers.diaper) ? trackers.diaper : [],
				medication: Array.isArray(trackers.medication) ? trackers.medication : [],
				medicationConfig: Array.isArray(trackers.medicationConfig)
					? trackers.medicationConfig
					: [...DEFAULT_MEDICATIONS],
				logNotes: Array.isArray(trackers.logNotes) ? trackers.logNotes : [],
			};

			// Preserve arbitrary tracker keys (library trackers like sleep, pain, etc.)
			const knownKeys = new Set(['feeding', 'diaper', 'medication', 'medicationConfig', 'logNotes', 'comments']);
			for (const key of Object.keys(trackers)) {
				if (!knownKeys.has(key)) {
					trackerData[key] = Array.isArray(trackers[key]) ? trackers[key] : [];
				}
			}

			return {
				version: parsed.version || 1,
				meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
				layout,
				trackers: trackerData,
				settingsOverrides: parsed.settingsOverrides && typeof parsed.settingsOverrides === 'object'
					? parsed.settingsOverrides
					: undefined,
				logicPackId: typeof parsed.logicPackId === 'string' ? parsed.logicPackId : undefined,
				analyticsWindows: parsed.analyticsWindows && typeof parsed.analyticsWindows === 'object'
					? parsed.analyticsWindows as Record<string, number>
					: {},
			};
		} catch (e) {
			console.error('Postpartum Tracker: failed to parse code block JSON. Data may be corrupted.', e);
			return this.makeEmpty();
		}
	}

	/**
	 * Save tracker data back to the code block in the file.
	 * This will trigger a re-render of the code block processor.
	 */
	async save(
		ctx: MarkdownPostProcessorContext,
		containerEl: HTMLElement,
		data: PostpartumData
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const sectionInfo = ctx.getSectionInfo(containerEl);
		if (!sectionInfo) {
			console.warn('Postpartum Tracker: could not get section info for save');
			return;
		}

		// Single-line JSON keeps the code block at 3 lines total (fence + json + fence)
		// so Obsidian always eagerly renders it without needing to scroll.
		// Obsidian Sync handles character-level merges on single files.
		const json = JSON.stringify(data);

		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			const { lineStart, lineEnd } = sectionInfo;

			// lineStart is the ``` opening fence, lineEnd is the ``` closing fence
			// Replace everything between them (exclusive of fences)
			const before = lines.slice(0, lineStart + 1);
			const after = lines.slice(lineEnd);

			return [...before, json, ...after].join('\n');
		});
	}

	/**
	 * Serialize data with one array entry per line.
	 * Top-level keys get light indentation, but array elements are kept as
	 * single-line JSON so the file stays compact (~500 lines vs 5000+).
	 */
	private serializeCompactEntries(data: PostpartumData): string {
		const lines: string[] = ['{'];

		// Filter out undefined values — JSON.stringify(undefined) produces the
		// literal string "undefined" which is invalid JSON and corrupts the file.
		const topKeys = (Object.keys(data) as (keyof PostpartumData)[])
			.filter(k => data[k] !== undefined);
		for (let i = 0; i < topKeys.length; i++) {
			const key = topKeys[i];
			const val = data[key];
			const comma = i < topKeys.length - 1 ? ',' : '';

			if (key === 'trackers' && val && typeof val === 'object') {
				lines.push(`  "trackers": {`);
				const tKeys = Object.keys(val);
				for (let j = 0; j < tKeys.length; j++) {
					const tk = tKeys[j];
					const arr = (val as Record<string, unknown>)[tk];
					const tComma = j < tKeys.length - 1 ? ',' : '';

					if (Array.isArray(arr) && arr.length > 0) {
						lines.push(`    "${tk}": [`);
						for (let k = 0; k < arr.length; k++) {
							const eComma = k < arr.length - 1 ? ',' : '';
							lines.push(`      ${JSON.stringify(arr[k])}${eComma}`);
						}
						lines.push(`    ]${tComma}`);
					} else {
						lines.push(`    "${tk}": ${JSON.stringify(arr)}${tComma}`);
					}
				}
				lines.push(`  }${comma}`);
			} else {
				lines.push(`  "${key}": ${JSON.stringify(val)}${comma}`);
			}
		}

		lines.push('}');
		return lines.join('\n');
	}

	/**
	 * Attempt to recover data from corrupted JSON (e.g. sync conflict splicing).
	 * Strategy: find the corruption point, truncate the broken array element,
	 * and close all open brackets/braces to produce valid JSON.
	 */
	private attemptJsonRecovery(source: string): Record<string, unknown> | null {
		// Binary-search for the longest parseable prefix isn't practical,
		// but we can try progressively shorter substrings ending at array boundaries.
		// First, find where JSON.parse fails by trying to parse and catching the position.
		let errorPos = -1;
		try {
			JSON.parse(source);
			return null; // Shouldn't reach here
		} catch (e: unknown) {
			const match = String(e).match(/position (\d+)/);
			if (match) errorPos = parseInt(match[1], 10);
		}
		if (errorPos < 0) return null;

		// Walk backwards from the error to find the last complete array element ('},')
		let truncateAt = source.lastIndexOf('},{', errorPos);
		if (truncateAt < 0) truncateAt = source.lastIndexOf('},\n', errorPos);
		if (truncateAt < 0) return null;

		// Keep everything up to and including the '}' of the last good element
		let fixed = source.slice(0, truncateAt + 1);

		// Close any open brackets/braces
		const opens: string[] = [];
		let inString = false;
		let escape = false;
		for (const ch of fixed) {
			if (escape) { escape = false; continue; }
			if (ch === '\\') { escape = true; continue; }
			if (ch === '"') { inString = !inString; continue; }
			if (inString) continue;
			if (ch === '{' || ch === '[') opens.push(ch);
			if (ch === '}' || ch === ']') opens.pop();
		}

		// Close in reverse order
		while (opens.length > 0) {
			const open = opens.pop();
			fixed += open === '{' ? '}' : ']';
		}

		try {
			return JSON.parse(fixed) as Record<string, unknown>;
		} catch {
			return null;
		}
	}

	private makeEmpty(): PostpartumData {
		return {
			...EMPTY_DATA,
			layout: [...DEFAULT_LAYOUT],
			trackers: {
				feeding: [],
				diaper: [],
				medication: [],
				medicationConfig: [...DEFAULT_MEDICATIONS],
				logNotes: [],
			},
		};
	}
}
