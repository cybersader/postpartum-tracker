import { App, TFile, MarkdownPostProcessorContext } from 'obsidian';
import type { PostpartumData, StorageMode } from '../types';
import { EMPTY_DATA, DEFAULT_LAYOUT, DEFAULT_MEDICATIONS } from '../types';

/**
 * Handles reading and writing tracker data.
 *
 * Storage strategy:
 *   - Code block contains a tiny JSON ref: {"dataFile":"name.tracker.json","ts":123}
 *   - Actual data lives in an external .tracker.json file next to the markdown
 *   - External file uses compact-per-entry format (one entry per line) for sync safety
 *   - Backwards compatible: old inline JSON is auto-migrated on first save
 */
export class CodeBlockStore {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Load tracker data. Handles both:
	 *   - External file ref: {"dataFile": "x.tracker.json", "ts": N}
	 *   - Inline data (legacy): full JSON blob in code block
	 */
	async load(source: string, sourcePath: string): Promise<PostpartumData> {
		try {
			const trimmed = source.trim();
			if (!trimmed) return this.makeEmpty();

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let parsed: any;
			try {
				parsed = JSON.parse(trimmed);
			} catch (jsonErr) {
				// Attempt recovery on corrupted inline data
				console.warn('Postpartum Tracker: JSON parse failed, attempting recovery...', jsonErr);
				parsed = this.attemptJsonRecovery(trimmed);
				if (!parsed) {
					throw jsonErr;
				}
				console.warn('Postpartum Tracker: recovery succeeded — some entries may be lost.');
			}

			// External file ref
			if (parsed.dataFile && typeof parsed.dataFile === 'string') {
				return await this.loadFromFile(parsed.dataFile, sourcePath);
			}

			// Legacy inline data
			return this.parseData(parsed);
		} catch (e) {
			console.error('Postpartum Tracker: failed to load data', e);
			return this.makeEmpty();
		}
	}

	/**
	 * Save tracker data to external file, then update code block ref to trigger re-render.
	 */
	async save(
		ctx: MarkdownPostProcessorContext,
		containerEl: HTMLElement,
		data: PostpartumData,
		storageMode: StorageMode = 'external'
	): Promise<void> {
		const sourcePath = ctx.sourcePath;
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const sectionInfo = ctx.getSectionInfo(containerEl);
		if (!sectionInfo) {
			console.warn('Postpartum Tracker: could not get section info for save');
			return;
		}

		// Inline mode: store everything in the code block (legacy behavior)
		if (storageMode === 'inline') {
			await this.saveInline(file, sectionInfo, data);
			return;
		}

		// External mode: store data in a separate .tracker.json file
		const dataFileName = this.getDataFileName(sourcePath);
		const dir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
		const dataFilePath = dir ? `${dir}/${dataFileName}` : dataFileName;

		// 1. Write data to external file (compact-per-entry for sync safety)
		const dataJson = this.serializeCompactEntries(data);
		try {
			await this.app.vault.adapter.write(dataFilePath, dataJson);
		} catch (e) {
			console.error('Postpartum Tracker: failed to write data file, falling back to inline', e);
			await this.saveInline(file, sectionInfo, data);
			return;
		}

		// 2. Verify the file was actually written (catch silent failures)
		try {
			const exists = await this.app.vault.adapter.exists(dataFilePath);
			if (!exists) {
				console.error('Postpartum Tracker: data file not found after write, falling back to inline');
				await this.saveInline(file, sectionInfo, data);
				return;
			}
		} catch {
			// If we can't verify, proceed anyway — the write likely succeeded
		}

		// 3. Rolling backup (every 10th save or every 5 minutes)
		await this.maybeWriteBackup(dataFilePath, dataJson);

		// 4. Only update the code block ref if it doesn't already point to
		//    this file (i.e., during initial migration from inline).
		//    On regular saves, skip the code block update entirely — the widget
		//    already refreshed its own DOM, so re-rendering is unnecessary and
		//    causes scroll jumps.
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			const { lineStart, lineEnd } = sectionInfo;
			const currentBlock = lines.slice(lineStart + 1, lineEnd).join('\n').trim();

			// Check if the code block already has the right ref
			try {
				const existing = JSON.parse(currentBlock);
				if (existing.dataFile === dataFileName) {
					// Already pointing to the right file — no change needed
					return content;
				}
			} catch { /* not valid JSON or inline data — needs migration */ }

			// Migration: replace inline data with the external file ref
			const ref = JSON.stringify({ dataFile: dataFileName, ts: Date.now() });
			const before = lines.slice(0, lineStart + 1);
			const after = lines.slice(lineEnd);
			return [...before, ref, ...after].join('\n');
		});
	}

	// ── Backup system ──

	private saveCount = 0;
	private lastBackupTime = 0;
	private static readonly BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
	private static readonly BACKUP_SAVE_INTERVAL = 10; // every 10th save
	private static readonly MAX_BACKUPS = 20;

	/** Write a timestamped backup if enough time/saves have passed. */
	private async maybeWriteBackup(dataFilePath: string, dataJson: string): Promise<void> {
		this.saveCount++;
		const now = Date.now();
		const elapsed = now - this.lastBackupTime;

		if (this.saveCount < CodeBlockStore.BACKUP_SAVE_INTERVAL
			&& elapsed < CodeBlockStore.BACKUP_INTERVAL_MS) {
			return;
		}

		this.saveCount = 0;
		this.lastBackupTime = now;

		try {
			// Store backups next to the data file: name.tracker.backups/
			const backupDir = dataFilePath.replace('.tracker.json', '.tracker-backups');
			const ts = new Date().toISOString().replace(/[:.]/g, '-');
			const backupPath = `${backupDir}/${ts}.json`;

			// Ensure backup directory exists
			const dirExists = await this.app.vault.adapter.exists(backupDir);
			if (!dirExists) {
				await this.app.vault.adapter.mkdir(backupDir);
			}

			// Write backup
			await this.app.vault.adapter.write(backupPath, dataJson);

			// Prune old backups (keep last N)
			await this.pruneBackups(backupDir);
		} catch (e) {
			// Backup failure is non-critical
			console.warn('Postpartum Tracker: backup write failed', e);
		}
	}

	/** Remove old backups, keeping only the most recent MAX_BACKUPS. */
	private async pruneBackups(backupDir: string): Promise<void> {
		try {
			const listing = await this.app.vault.adapter.list(backupDir);
			const files = listing.files
				.filter(f => f.endsWith('.json'))
				.sort(); // ISO timestamps sort lexicographically

			const excess = files.length - CodeBlockStore.MAX_BACKUPS;
			if (excess <= 0) return;

			for (let i = 0; i < excess; i++) {
				await this.app.vault.adapter.remove(files[i]);
			}
		} catch { /* best effort */ }
	}

	// ── Private helpers ──

	/** Load data from an external .tracker.json file. */
	private async loadFromFile(dataFileName: string, sourcePath: string): Promise<PostpartumData> {
		const dir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
		const filePath = dir ? `${dir}/${dataFileName}` : dataFileName;

		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (!exists) {
				console.error(`Postpartum Tracker: data file ${filePath} not found! Use "Restore from backup" command to recover.`);
				return this.makeEmpty();
			}

			const content = await this.app.vault.adapter.read(filePath);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let parsed: any;
			try {
				parsed = JSON.parse(content);
			} catch (jsonErr) {
				// Auto-repair corrupted external file
				console.warn('Postpartum Tracker: external file corrupted, attempting recovery...', jsonErr);
				parsed = this.attemptJsonRecovery(content);
				if (!parsed) {
					console.error('Postpartum Tracker: recovery failed for', filePath);
					return this.makeEmpty();
				}
				// Write repaired data back
				try {
					await this.app.vault.adapter.write(filePath, JSON.stringify(parsed, null, 2));
					console.warn('Postpartum Tracker: repaired and saved', filePath);
				} catch { /* best effort */ }
			}

			return this.parseData(parsed);
		} catch (e) {
			console.error(`Postpartum Tracker: failed to load ${filePath}`, e);
			return this.makeEmpty();
		}
	}

	/** Fallback: save data inline in the code block (old behavior). */
	private async saveInline(
		file: TFile,
		sectionInfo: { lineStart: number; lineEnd: number },
		data: PostpartumData
	): Promise<void> {
		const json = JSON.stringify(data);
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			const { lineStart, lineEnd } = sectionInfo;
			const before = lines.slice(0, lineStart + 1);
			const after = lines.slice(lineEnd);
			return [...before, json, ...after].join('\n');
		});
	}

	/** Derive the data file name from the markdown file path. */
	private getDataFileName(sourcePath: string): string {
		const fileName = sourcePath.substring(sourcePath.lastIndexOf('/') + 1);
		return fileName.replace(/\.md$/, '.tracker.json');
	}

	/** Parse a raw object into validated PostpartumData. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private parseData(parsed: any): PostpartumData {
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
	}

	/** Public access to compact serialization for writeTrackerBlock in main.ts. */
	serializeForExternal(data: PostpartumData): string {
		return this.serializeCompactEntries(data);
	}

	/**
	 * Serialize data with one array entry per line.
	 * Top-level keys get light indentation, but array elements are kept as
	 * single-line JSON so the file stays compact for sync merges.
	 */
	private serializeCompactEntries(data: PostpartumData): string {
		const lines: string[] = ['{'];

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
		let errorPos = -1;
		try {
			JSON.parse(source);
			return null;
		} catch (e: unknown) {
			const match = String(e).match(/position (\d+)/);
			if (match) errorPos = parseInt(match[1], 10);
		}
		if (errorPos < 0) return null;

		// Walk backwards from the error to find the last complete array element
		let truncateAt = source.lastIndexOf('},{', errorPos);
		if (truncateAt < 0) truncateAt = source.lastIndexOf('},\n', errorPos);
		if (truncateAt < 0) return null;

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
