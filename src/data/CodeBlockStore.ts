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
			const parsed = JSON.parse(trimmed);

			// Backward-compat: merge saved layout with defaults (new modules get appended)
			let layout: string[] = [...DEFAULT_LAYOUT];
			if (Array.isArray(parsed.layout) && parsed.layout.length > 0) {
				const validSet = new Set(DEFAULT_LAYOUT);
				const saved = parsed.layout.filter((id: string) => validSet.has(id));
				const missing = DEFAULT_LAYOUT.filter(id => !saved.includes(id));
				layout = [...saved, ...missing];
			}

			const trackers = parsed.trackers && typeof parsed.trackers === 'object'
				? parsed.trackers
				: {};

			return {
				version: parsed.version || 1,
				meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
				layout,
				trackers: {
					feeding: Array.isArray(trackers.feeding) ? trackers.feeding : [],
					diaper: Array.isArray(trackers.diaper) ? trackers.diaper : [],
					medication: Array.isArray(trackers.medication) ? trackers.medication : [],
					medicationConfig: Array.isArray(trackers.medicationConfig)
						? trackers.medicationConfig
						: [...DEFAULT_MEDICATIONS],
					logNotes: Array.isArray(trackers.logNotes) ? trackers.logNotes : [],
				},
				settingsOverrides: parsed.settingsOverrides && typeof parsed.settingsOverrides === 'object'
					? parsed.settingsOverrides
					: undefined,
			};
		} catch {
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
