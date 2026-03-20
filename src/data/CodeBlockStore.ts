import { App, TFile, MarkdownPostProcessorContext } from 'obsidian';
import type { PostpartumData, StorageMode } from '../types';
import { EMPTY_DATA, DEFAULT_LAYOUT, DEFAULT_MEDICATIONS } from '../types';

/**
 * Handles reading and writing tracker data.
 *
 * Storage strategy (per-device journals):
 *   - Code block: {"dataFile":"note.tracker","multiDevice":true}
 *   - Each device writes: note.tracker.{deviceShortId}.json
 *   - On load: read ALL note.tracker.*.json files, merge by entry ID
 *   - No two devices ever write to the same file → sync conflicts impossible
 *   - Backwards compatible: old single-file and inline formats auto-migrate
 */
export class CodeBlockStore {
	private app: App;
	readonly deviceShortId: string;

	constructor(app: App, deviceShortId: string) {
		this.app = app;
		this.deviceShortId = deviceShortId;
	}

	/**
	 * Load tracker data. Handles:
	 *   - Multi-device ref: {"dataFile":"note.tracker","multiDevice":true}
	 *   - Single-file ref: {"dataFile":"note.tracker.json","ts":N}
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
				console.warn('Postpartum Tracker: JSON parse failed, attempting recovery...', jsonErr);
				parsed = this.attemptJsonRecovery(trimmed);
				if (!parsed) throw jsonErr;
				console.warn('Postpartum Tracker: recovery succeeded — some entries may be lost.');
			}

			if (parsed.dataFile && typeof parsed.dataFile === 'string') {
				if (parsed.multiDevice) {
					return await this.loadMultiDevice(parsed.dataFile, sourcePath);
				}
				// Legacy single-file ref — load it, but merge with any device files too
				return await this.loadMultiDevice(
					parsed.dataFile.replace(/\.json$/, ''), sourcePath
				);
			}

			// Inline data
			return this.parseData(parsed);
		} catch (e) {
			console.error('Postpartum Tracker: failed to load data', e);
			return this.makeEmpty();
		}
	}

	/**
	 * Save tracker data to this device's journal file.
	 * Never touches other devices' files.
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

		// Per-device external file
		const baseName = this.getBaseName(sourcePath);
		const dir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
		const prefix = dir ? `${dir}/` : '';
		const deviceFileName = `${baseName}.${this.deviceShortId}.json`;
		const deviceFilePath = `${prefix}${deviceFileName}`;

		// Stamp with device metadata for merge conflict resolution
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const fileData: any = {
			...data,
			_deviceId: this.deviceShortId,
			_metaModified: Date.now(),
			_layoutModified: Date.now(),
			_configModified: Date.now(),
		};

		// Preserve _deleted list from previous saves
		if ((data as any)._deleted) {
			fileData._deleted = (data as any)._deleted;
		}

		const dataJson = this.serializeCompactEntries(fileData);

		// Write to this device's file
		try {
			await this.app.vault.adapter.write(deviceFilePath, dataJson);
		} catch (e) {
			console.error('Postpartum Tracker: failed to write device file, falling back to inline', e);
			await this.saveInline(file, sectionInfo, data);
			return;
		}

		// Verify
		try {
			const exists = await this.app.vault.adapter.exists(deviceFilePath);
			if (!exists) {
				console.error('Postpartum Tracker: device file not found after write');
				await this.saveInline(file, sectionInfo, data);
				return;
			}
		} catch { /* proceed */ }

		// Backup merged data periodically
		await this.maybeWriteBackup(prefix, baseName, dataJson);

		// Migrate legacy: update code block ref to multi-device format if needed
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			const { lineStart, lineEnd } = sectionInfo;
			const currentBlock = lines.slice(lineStart + 1, lineEnd).join('\n').trim();

			try {
				const existing = JSON.parse(currentBlock);
				if (existing.multiDevice && existing.dataFile === baseName) {
					return content; // Already correct
				}
			} catch { /* needs migration */ }

			// Write multi-device ref
			const ref = JSON.stringify({ dataFile: baseName, multiDevice: true });
			const before = lines.slice(0, lineStart + 1);
			const after = lines.slice(lineEnd);
			return [...before, ref, ...after].join('\n');
		});

		// Clean up legacy single file (copy to device file if not done)
		await this.migrateLegacyFile(prefix, baseName);
	}

	/** Public access to compact serialization for writeTrackerBlock in main.ts. */
	serializeForExternal(data: PostpartumData): string {
		return this.serializeCompactEntries(data);
	}

	// ── Multi-device load + merge ──

	/** Load all device files and merge them. */
	private async loadMultiDevice(baseName: string, sourcePath: string): Promise<PostpartumData> {
		const dir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
		const prefix = dir ? `${dir}/` : '';

		try {
			const listing = await this.app.vault.adapter.list(dir || '/');
			const fileNames = listing.files.map(f => f.substring(f.lastIndexOf('/') + 1));

			// Match: baseName.{8hexchars}.json
			const devicePattern = new RegExp(
				`^${this.escapeRegex(baseName)}\\.([a-f0-9]{8})\\.json$`
			);
			const deviceFiles = fileNames.filter(f => devicePattern.test(f));

			// Also check legacy single file
			const legacyName = `${baseName}.json`;
			const hasLegacy = fileNames.includes(legacyName);

			// Load all
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const allSources: any[] = [];
			for (const fn of deviceFiles) {
				const raw = await this.loadRawFile(`${prefix}${fn}`);
				if (raw) allSources.push(raw);
			}
			if (hasLegacy) {
				const raw = await this.loadRawFile(`${prefix}${legacyName}`);
				if (raw) allSources.push(raw);
			}

			if (allSources.length === 0) return this.makeEmpty();
			if (allSources.length === 1) return this.parseData(allSources[0]);

			return this.mergeDeviceData(allSources);
		} catch (e) {
			console.error('Postpartum Tracker: multi-device load failed', e);
			return this.makeEmpty();
		}
	}

	/** Load and parse a single JSON file, with recovery. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private async loadRawFile(filePath: string): Promise<any | null> {
		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (!exists) return null;
			const content = await this.app.vault.adapter.read(filePath);
			try {
				return JSON.parse(content);
			} catch {
				const recovered = this.attemptJsonRecovery(content);
				if (recovered) {
					console.warn(`Postpartum Tracker: recovered corrupted file ${filePath}`);
					return recovered;
				}
				console.error(`Postpartum Tracker: unrecoverable corruption in ${filePath}`);
				return null;
			}
		} catch {
			return null;
		}
	}

	/** Merge data from multiple device files into a single PostpartumData. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private mergeDeviceData(sources: any[]): PostpartumData {
		const merged = this.makeEmpty();

		// Collect all _deleted IDs across all devices
		const deletedIds = new Set<string>();
		for (const src of sources) {
			if (Array.isArray(src._deleted)) {
				for (const id of src._deleted) deletedIds.add(id);
			}
		}

		// Meta: last-modified-wins
		let latestMeta = 0;
		for (const src of sources) {
			const ts = src._metaModified || 0;
			if (ts >= latestMeta && src.meta) {
				latestMeta = ts;
				merged.meta = { ...src.meta };
			}
		}
		// Fallback: pick first non-empty meta
		if (!merged.meta.babyName) {
			for (const src of sources) {
				if (src.meta?.babyName) { merged.meta = { ...src.meta }; break; }
			}
		}

		// Layout: last-modified-wins
		let latestLayout = 0;
		for (const src of sources) {
			const ts = src._layoutModified || 0;
			if (ts >= latestLayout && Array.isArray(src.layout) && src.layout.length > 0) {
				latestLayout = ts;
				merged.layout = [...src.layout];
			}
		}
		// Ensure layout has defaults
		if (merged.layout.length === 0) merged.layout = [...DEFAULT_LAYOUT];
		const savedSet = new Set(merged.layout);
		for (const id of DEFAULT_LAYOUT) {
			if (!savedSet.has(id)) merged.layout.push(id);
		}

		// Tracker entries: union by ID, deduplicate, exclude deleted
		const allTrackerKeys = new Set<string>();
		for (const src of sources) {
			if (src.trackers && typeof src.trackers === 'object') {
				for (const key of Object.keys(src.trackers)) allTrackerKeys.add(key);
			}
		}

		for (const key of allTrackerKeys) {
			if (key === 'medicationConfig') {
				// Config: last-modified-wins
				let latestConfig = 0;
				for (const src of sources) {
					const ts = src._configModified || 0;
					if (ts >= latestConfig && Array.isArray(src.trackers?.[key])) {
						latestConfig = ts;
						merged.trackers[key] = [...src.trackers[key]];
					}
				}
				if (!merged.trackers[key]) merged.trackers[key] = [...DEFAULT_MEDICATIONS];
				continue;
			}

			// Entry arrays: union by ID
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const entryMap = new Map<string, any>();
			for (const src of sources) {
				const arr = src.trackers?.[key];
				if (!Array.isArray(arr)) continue;
				for (const entry of arr) {
					if (!entry.id) continue;
					if (deletedIds.has(entry.id)) continue;

					const existing = entryMap.get(entry.id);
					if (!existing) {
						entryMap.set(entry.id, entry);
					} else {
						// Keep the version with more fields or later timestamp
						const existingTs = existing.start || existing.timestamp || '';
						const newTs = entry.start || entry.timestamp || '';
						const existingFields = Object.keys(existing).length;
						const newFields = Object.keys(entry).length;
						if (newFields > existingFields || (newFields === existingFields && newTs > existingTs)) {
							entryMap.set(entry.id, entry);
						}
					}
				}
			}

			// Sort by timestamp ascending
			merged.trackers[key] = Array.from(entryMap.values()).sort((a, b) => {
				const aT = a.start || a.timestamp || '';
				const bT = b.start || b.timestamp || '';
				return aT < bT ? -1 : aT > bT ? 1 : 0;
			});
		}

		// analyticsWindows: last-modified-wins
		for (const src of sources) {
			if (src.analyticsWindows && typeof src.analyticsWindows === 'object') {
				merged.analyticsWindows = { ...merged.analyticsWindows, ...src.analyticsWindows };
			}
		}

		// settingsOverrides / logicPackId: last-modified-wins
		let latestOverride = 0;
		for (const src of sources) {
			const ts = src._metaModified || 0;
			if (ts >= latestOverride) {
				latestOverride = ts;
				if (src.settingsOverrides) merged.settingsOverrides = src.settingsOverrides;
				if (src.logicPackId) merged.logicPackId = src.logicPackId;
			}
		}

		return merged;
	}

	// ── Migration ──

	/** If legacy single file exists, copy its data into the current device's file. */
	private async migrateLegacyFile(prefix: string, baseName: string): Promise<void> {
		const legacyPath = `${prefix}${baseName}.json`;
		try {
			const exists = await this.app.vault.adapter.exists(legacyPath);
			if (!exists) return;

			const devicePath = `${prefix}${baseName}.${this.deviceShortId}.json`;
			const deviceExists = await this.app.vault.adapter.exists(devicePath);
			if (deviceExists) return; // Already migrated

			// Copy legacy to device file
			const content = await this.app.vault.adapter.read(legacyPath);
			await this.app.vault.adapter.write(devicePath, content);
			console.log(`Postpartum Tracker: migrated legacy file to ${devicePath}`);
		} catch { /* best effort */ }
	}

	// ── Backup system ──

	private saveCount = 0;
	private lastBackupTime = 0;
	private hasBackedUp = false;
	private static readonly BACKUP_INTERVAL_MS = 5 * 60 * 1000;
	private static readonly BACKUP_SAVE_INTERVAL = 10;
	private static readonly MAX_BACKUPS = 20;

	private async maybeWriteBackup(prefix: string, baseName: string, dataJson: string): Promise<void> {
		this.saveCount++;
		const now = Date.now();
		const elapsed = now - this.lastBackupTime;

		if (this.hasBackedUp
			&& this.saveCount < CodeBlockStore.BACKUP_SAVE_INTERVAL
			&& elapsed < CodeBlockStore.BACKUP_INTERVAL_MS) {
			return;
		}
		this.hasBackedUp = true;
		this.saveCount = 0;
		this.lastBackupTime = now;

		try {
			const backupDir = `${prefix}${baseName}-backups`;
			const ts = new Date().toISOString().replace(/[:.]/g, '-');
			const backupPath = `${backupDir}/${ts}.json`;

			const dirExists = await this.app.vault.adapter.exists(backupDir);
			if (!dirExists) await this.app.vault.adapter.mkdir(backupDir);

			await this.app.vault.adapter.write(backupPath, dataJson);
			await this.pruneBackups(backupDir);
		} catch (e) {
			console.warn('Postpartum Tracker: backup write failed', e);
		}
	}

	private async pruneBackups(backupDir: string): Promise<void> {
		try {
			const listing = await this.app.vault.adapter.list(backupDir);
			const files = listing.files.filter(f => f.endsWith('.json')).sort();
			const excess = files.length - CodeBlockStore.MAX_BACKUPS;
			if (excess <= 0) return;
			for (let i = 0; i < excess; i++) {
				await this.app.vault.adapter.remove(files[i]);
			}
		} catch { /* best effort */ }
	}

	// ── Helpers ──

	/** Fallback: save data inline in the code block. */
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

	/** Get the base name for tracker files (without .json or device suffix). */
	private getBaseName(sourcePath: string): string {
		const fileName = sourcePath.substring(sourcePath.lastIndexOf('/') + 1);
		return fileName.replace(/\.md$/, '.tracker');
	}

	/** Parse a raw object into validated PostpartumData. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private parseData(parsed: any): PostpartumData {
		let layout: string[] = [...DEFAULT_LAYOUT];
		if (Array.isArray(parsed.layout) && parsed.layout.length > 0) {
			const savedSet = new Set(parsed.layout as string[]);
			const missing = DEFAULT_LAYOUT.filter(id => !savedSet.has(id));
			layout = [...(parsed.layout as string[]), ...missing];
		}

		const trackers = parsed.trackers && typeof parsed.trackers === 'object'
			? parsed.trackers : {};

		const trackerData: PostpartumData['trackers'] = {
			feeding: Array.isArray(trackers.feeding) ? trackers.feeding : [],
			diaper: Array.isArray(trackers.diaper) ? trackers.diaper : [],
			medication: Array.isArray(trackers.medication) ? trackers.medication : [],
			medicationConfig: Array.isArray(trackers.medicationConfig)
				? trackers.medicationConfig : [...DEFAULT_MEDICATIONS],
			logNotes: Array.isArray(trackers.logNotes) ? trackers.logNotes : [],
		};

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
				? parsed.settingsOverrides : undefined,
			logicPackId: typeof parsed.logicPackId === 'string' ? parsed.logicPackId : undefined,
			analyticsWindows: parsed.analyticsWindows && typeof parsed.analyticsWindows === 'object'
				? parsed.analyticsWindows as Record<string, number> : {},
		};
	}

	/**
	 * Serialize data with one array entry per line.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private serializeCompactEntries(data: any): string {
		const lines: string[] = ['{'];
		const topKeys = Object.keys(data).filter(k => data[k] !== undefined);

		for (let i = 0; i < topKeys.length; i++) {
			const key = topKeys[i];
			const val = data[key];
			const comma = i < topKeys.length - 1 ? ',' : '';

			if (key === 'trackers' && val && typeof val === 'object') {
				lines.push(`  "trackers": {`);
				const tKeys = Object.keys(val);
				for (let j = 0; j < tKeys.length; j++) {
					const tk = tKeys[j];
					const arr = val[tk];
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

	/** Attempt to recover corrupted JSON. */
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

		let truncateAt = source.lastIndexOf('},{', errorPos);
		if (truncateAt < 0) truncateAt = source.lastIndexOf('},\n', errorPos);
		if (truncateAt < 0) return null;

		let fixed = source.slice(0, truncateAt + 1);
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

	private escapeRegex(s: string): string {
		return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
