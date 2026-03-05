/**
 * Rules-based NLP parser for quick entry text input.
 * Zero dependencies — keyword matching + regex extraction.
 */

export interface ParsedEntry {
	moduleId: string;
	summary: string;
	data: Record<string, unknown>;
	confidence: 'high' | 'medium' | 'low';
}

export class QuickEntryParser {
	private enabledModuleIds: Set<string>;
	private medicationNames: string[];

	constructor(enabledModuleIds: string[], medicationNames: string[]) {
		this.enabledModuleIds = new Set(enabledModuleIds);
		this.medicationNames = medicationNames.map(n => n.toLowerCase());
	}

	parse(input: string): ParsedEntry | null {
		const text = input.trim();
		if (!text) return null;

		const lower = text.toLowerCase();
		const tokens = lower.split(/\s+/);

		return (
			this.tryFeeding(tokens, lower, text) ||
			this.tryDiaper(tokens, lower) ||
			this.tryMedication(tokens, lower, text) ||
			this.trySleep(tokens, lower) ||
			this.trySimpleTracker(tokens, lower) ||
			this.tryComment(text)
		);
	}

	// ── Feeding ──

	private tryFeeding(tokens: string[], lower: string, _raw: string): ParsedEntry | null {
		const keywords = ['fed', 'feed', 'nurse', 'nursed', 'breastfed', 'breastfeed', 'bottle', 'formula'];
		if (!keywords.some(k => tokens.includes(k))) return null;
		if (!this.enabledModuleIds.has('feeding')) return null;

		const data: Record<string, unknown> = {};
		let parts: string[] = [];

		// Side
		if (lower.includes('left')) { data.side = 'left'; parts.push('left'); }
		else if (lower.includes('right')) { data.side = 'right'; parts.push('right'); }
		else if (lower.includes('both')) { data.side = 'both'; parts.push('both sides'); }

		// Type
		const isBottle = tokens.includes('bottle') || tokens.includes('formula');
		if (isBottle) {
			data.type = 'bottle';
			parts.unshift('Bottle');
		} else {
			data.type = 'breast';
			parts.unshift('Fed');
		}

		// Duration
		const dur = extractDuration(tokens, lower);
		if (dur) {
			data.durationMs = dur.ms;
			parts.push(dur.label);
		}

		// Volume (for bottle)
		const vol = extractVolume(tokens, lower);
		if (vol) {
			data.volume = vol.value;
			data.volumeUnit = vol.unit;
			parts.push(vol.label);
		}

		// Time modifier
		const time = extractTimeModifier(tokens, lower);
		if (time) data.timestamp = time;

		return {
			moduleId: 'feeding',
			summary: parts.join(' '),
			data,
			confidence: dur || vol ? 'high' : 'medium',
		};
	}

	// ── Diaper ──

	private tryDiaper(tokens: string[], lower: string): ParsedEntry | null {
		const wetWords = ['wet'];
		const dirtyWords = ['dirty', 'poop', 'poo', 'poopy', 'stool'];
		const diaperWords = ['diaper', 'nappy'];

		const hasWet = wetWords.some(w => tokens.includes(w));
		const hasDirty = dirtyWords.some(w => tokens.includes(w));
		const hasDiaper = diaperWords.some(w => tokens.includes(w));
		const hasBoth = tokens.includes('both');

		if (!hasWet && !hasDirty && (!hasDiaper && !hasBoth)) return null;
		if (!this.enabledModuleIds.has('diaper')) return null;

		let wet = false, dirty = false;
		if (hasBoth || (hasWet && hasDirty)) { wet = true; dirty = true; }
		else if (hasWet) { wet = true; }
		else if (hasDirty) { dirty = true; }
		else if (hasDiaper) { wet = true; } // "diaper" alone defaults to wet

		const data: Record<string, unknown> = { wet, dirty };

		// Color
		const colors = ['meconium', 'transitional', 'yellow', 'green', 'brown'];
		for (const c of colors) {
			if (lower.includes(c)) {
				data.color = c === 'yellow' ? 'yellow-seedy' : c;
				break;
			}
		}

		// Time
		const time = extractTimeModifier(tokens, lower);
		if (time) data.timestamp = time;

		const parts: string[] = [];
		if (wet && dirty) parts.push('Both');
		else if (wet) parts.push('Wet');
		else parts.push('Dirty');
		parts.push('diaper');
		if (data.color) parts.push(`(${String(data.color).replace('-', ' ')})`);

		return {
			moduleId: 'diaper',
			summary: parts.join(' '),
			data,
			confidence: (hasWet || hasDirty) ? 'high' : 'medium',
		};
	}

	// ── Medication ──

	private tryMedication(tokens: string[], lower: string, raw: string): ParsedEntry | null {
		if (!this.enabledModuleIds.has('medication')) return null;

		// Check for medication keywords
		const medKeywords = ['took', 'take', 'med', 'meds', 'medication', 'dose', 'dosed'];
		const hasMedKeyword = medKeywords.some(k => tokens.includes(k));

		// Try matching medication names
		let matchedMed: string | null = null;
		for (const name of this.medicationNames) {
			if (lower.includes(name)) {
				matchedMed = name;
				break;
			}
		}

		if (!hasMedKeyword && !matchedMed) return null;

		const data: Record<string, unknown> = {};
		if (matchedMed) data.name = matchedMed;

		const time = extractTimeModifier(tokens, lower);
		if (time) data.timestamp = time;

		const summary = matchedMed
			? `Took ${matchedMed}`
			: 'Medication dose';

		return {
			moduleId: 'medication',
			summary,
			data,
			confidence: matchedMed ? 'high' : 'low',
		};
	}

	// ── Sleep ──

	private trySleep(tokens: string[], lower: string): ParsedEntry | null {
		const keywords = ['slept', 'sleep', 'nap', 'napped', 'asleep'];
		if (!keywords.some(k => tokens.includes(k))) return null;
		if (!this.enabledModuleIds.has('sleep')) return null;

		const data: Record<string, unknown> = {};
		const parts: string[] = ['Slept'];

		const dur = extractDuration(tokens, lower);
		if (dur) {
			data.durationMs = dur.ms;
			parts.push(dur.label);
		}

		const time = extractTimeModifier(tokens, lower);
		if (time) data.timestamp = time;

		return {
			moduleId: 'sleep',
			summary: parts.join(' '),
			data,
			confidence: dur ? 'high' : 'medium',
		};
	}

	// ── Simple trackers (keyword match against enabled module names) ──

	private trySimpleTracker(tokens: string[], lower: string): ParsedEntry | null {
		const simpleKeywords: Record<string, string[]> = {
			'tummy-time': ['tummy', 'tummy time'],
			'pumping': ['pumped', 'pump', 'pumping'],
			'temperature': ['temp', 'temperature', 'fever'],
			'weight': ['weight', 'weighed'],
			'pain': ['pain', 'hurts', 'ache', 'cramp', 'cramping'],
			'mood': ['mood', 'feeling', 'felt'],
			'walking': ['walked', 'walk', 'walking'],
			'skin-to-skin': ['skin to skin', 'kangaroo'],
			'hiccups': ['hiccups', 'hiccup'],
			'bowel-movement': ['bowel', 'bm'],
			'bleeding': ['bleeding', 'spotting'],
		};

		for (const [moduleId, kws] of Object.entries(simpleKeywords)) {
			if (!this.enabledModuleIds.has(moduleId)) continue;
			const match = kws.some(kw => kw.includes(' ') ? lower.includes(kw) : tokens.includes(kw));
			if (!match) continue;

			const data: Record<string, unknown> = {};

			const dur = extractDuration(tokens, lower);
			if (dur) data.durationMs = dur.ms;

			const vol = extractVolume(tokens, lower);
			if (vol) { data.value = vol.value; data.unit = vol.unit; }

			const time = extractTimeModifier(tokens, lower);
			if (time) data.timestamp = time;

			const parts = [moduleId.replace(/-/g, ' ')];
			if (dur) parts.push(dur.label);
			if (vol) parts.push(vol.label);

			return {
				moduleId,
				summary: capitalize(parts.join(' ')),
				data,
				confidence: 'medium',
			};
		}

		return null;
	}

	// ── Comment fallback ──

	private tryComment(text: string): ParsedEntry | null {
		if (!this.enabledModuleIds.has('comments')) return null;

		return {
			moduleId: 'comments',
			summary: text.length > 40 ? text.slice(0, 37) + '...' : text,
			data: { text, category: 'general' },
			confidence: 'low',
		};
	}
}

// ── Shared extractors ──

interface DurationResult { ms: number; label: string; }

function extractDuration(tokens: string[], lower: string): DurationResult | null {
	// "20 min", "2h", "1.5 hours", "45m", "1h 30m", "30 minutes"
	const pattern = /(\d+(?:\.\d+)?)\s*(h(?:ours?|r)?|m(?:in(?:utes?)?)?)/gi;
	let totalMs = 0;
	let match: RegExpExecArray | null;
	const parts: string[] = [];

	while ((match = pattern.exec(lower)) !== null) {
		const val = parseFloat(match[1]);
		const unit = match[2].toLowerCase();
		if (unit.startsWith('h')) {
			totalMs += val * 3600000;
			parts.push(`${val}h`);
		} else {
			totalMs += val * 60000;
			parts.push(`${Math.round(val)}m`);
		}
	}

	if (totalMs === 0) return null;
	return { ms: totalMs, label: parts.join(' ') };
}

function extractTimeModifier(_tokens: string[], lower: string): string | null {
	// "at 3pm", "at 3:30pm", "at 14:30"
	const atMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (atMatch) {
		let h = parseInt(atMatch[1], 10);
		const m = parseInt(atMatch[2] || '0', 10);
		const ampm = atMatch[3]?.toLowerCase();
		if (ampm === 'pm' && h < 12) h += 12;
		if (ampm === 'am' && h === 12) h = 0;

		const now = new Date();
		now.setHours(h, m, 0, 0);
		return now.toISOString();
	}

	// "30 min ago", "2 hours ago"
	const agoMatch = lower.match(/(\d+(?:\.\d+)?)\s*(h(?:ours?|r)?|m(?:in(?:utes?)?)?)\s+ago/i);
	if (agoMatch) {
		const val = parseFloat(agoMatch[1]);
		const unit = agoMatch[2].toLowerCase();
		const ms = unit.startsWith('h') ? val * 3600000 : val * 60000;
		return new Date(Date.now() - ms).toISOString();
	}

	return null;
}

interface VolumeResult { value: number; unit: string; label: string; }

function extractVolume(_tokens: string[], lower: string): VolumeResult | null {
	// "4oz", "120ml", "4 oz", "120 ml"
	const match = lower.match(/(\d+(?:\.\d+)?)\s*(oz|ml)/i);
	if (!match) return null;
	const value = parseFloat(match[1]);
	const unit = match[2].toLowerCase();
	return { value, unit, label: `${value}${unit}` };
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
