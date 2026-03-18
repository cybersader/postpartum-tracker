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
		const keywords = ['fed', 'feed', 'nurse', 'nursed', 'breastfed', 'breastfeed',
			'bottle', 'formula', 'boob', 'breast', 'nipple', 'latch', 'latched'];
		if (!keywords.some(k => tokens.includes(k))) return null;
		if (!this.enabledModuleIds.has('feeding')) return null;

		const data: Record<string, unknown> = {};
		let parts: string[] = [];

		// Side
		if (lower.includes('left')) { data.side = 'left'; parts.push('left'); }
		else if (lower.includes('right')) { data.side = 'right'; parts.push('right'); }
		else if (lower.includes('both')) { data.side = 'both'; parts.push('both sides'); }

		// Type — bottle/formula are bottle, everything else is breast
		const bottleWords = ['bottle', 'formula'];
		const isBottle = bottleWords.some(w => tokens.includes(w));
		if (isBottle) {
			data.type = 'bottle';
			parts.unshift('Bottle');
		} else {
			data.type = 'breast';
			parts.unshift('Fed');
		}

		// Try time range first: "fed from 2pm to 2:30pm"
		const range = extractTimeRange(lower);
		if (range) {
			data.timestamp = range.start;
			data.endTimestamp = range.end;
			data.durationMs = range.durationMs;
			const min = Math.round(range.durationMs / 60000);
			parts.push(`${min}m`);
		} else {
			// Duration
			const dur = extractDuration(tokens, lower);
			if (dur) {
				data.durationMs = dur.ms;
				parts.push(dur.label);
			}

			// Time modifier
			const time = extractTimeModifier(tokens, lower);
			if (time) data.timestamp = time;
		}

		// Volume (for bottle)
		const vol = extractVolume(tokens, lower);
		if (vol) {
			data.volume = vol.value;
			data.volumeUnit = vol.unit;
			parts.push(vol.label);
		}

		return {
			moduleId: 'feeding',
			summary: parts.join(' '),
			data,
			confidence: range || data.durationMs || vol ? 'high' : 'medium',
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

		// Color keywords — stool colors also trigger the diaper parser
		const colorMap: [string, string][] = [
			['seedy', 'yellow-seedy'],
			['meconium', 'meconium'],
			['transitional', 'transitional'],
			['yellow', 'yellow-seedy'],
			['green', 'green'],
			['brown', 'brown'],
		];
		let detectedColor: string | null = null;
		for (const [keyword, color] of colorMap) {
			if (lower.includes(keyword)) {
				detectedColor = color;
				break;
			}
		}

		if (!hasWet && !hasDirty && !hasDiaper && !hasBoth && !detectedColor) return null;
		if (!this.enabledModuleIds.has('diaper')) return null;

		let wet = false, dirty = false;
		if (hasBoth || (hasWet && hasDirty)) { wet = true; dirty = true; }
		else if (hasWet && detectedColor) { wet = true; dirty = true; } // "wet + color" = both
		else if (hasWet) { wet = true; }
		else if (hasDirty) { dirty = true; }
		else if (detectedColor) { dirty = true; } // color alone = dirty (colors describe stool)
		else if (hasDiaper) { wet = true; } // "diaper" alone defaults to wet

		const data: Record<string, unknown> = { wet, dirty };
		if (detectedColor) data.color = detectedColor;

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

		// Dosage: "500mg", "800 mg", "5-325mg"
		const dosageMatch = lower.match(/(\d+(?:-\d+)?)\s*mg/i);
		if (dosageMatch) data.dosage = `${dosageMatch[1]}mg`;

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
		const keywords = ['slept', 'sleep', 'nap', 'napped', 'asleep', 'woke', 'started'];
		if (!keywords.some(k => tokens.includes(k))) return null;
		if (!this.enabledModuleIds.has('sleep')) return null;

		const data: Record<string, unknown> = {};

		// Infer sleep type from keywords
		const napWords = ['nap', 'napped', 'napping'];
		const nightWords = ['night', 'bedtime', 'overnight'];
		if (napWords.some(w => tokens.includes(w))) {
			data.type = 'nap';
		} else if (nightWords.some(w => tokens.includes(w))) {
			data.type = 'night';
		}

		const typeLabel = data.type === 'nap' ? 'Napped' : data.type === 'night' ? 'Night sleep' : 'Slept';
		const parts: string[] = [typeLabel];

		// Try time range first: "started at 1230 woke up at 130", "from 1pm to 3pm"
		const range = extractTimeRange(lower);
		if (range) {
			data.timestamp = range.start;
			data.endTimestamp = range.end;
			data.durationMs = range.durationMs;
			const min = Math.round(range.durationMs / 60000);
			const h = Math.floor(min / 60);
			const m = min % 60;
			parts.push(h > 0 ? `${h}h ${m}m` : `${m}m`);
		} else {
			const dur = extractDuration(tokens, lower);
			if (dur) {
				data.durationMs = dur.ms;
				parts.push(dur.label);
			}

			const time = extractTimeModifier(tokens, lower);
			if (time) data.timestamp = time;
		}

		return {
			moduleId: 'sleep',
			summary: parts.join(' '),
			data,
			confidence: range ? 'high' : (data.durationMs ? 'high' : 'medium'),
		};
	}

	// ── Simple trackers (keyword match against enabled module names) ──

	private trySimpleTracker(tokens: string[], lower: string): ParsedEntry | null {
		const simpleKeywords: Record<string, string[]> = {
			'tummy-time': ['tummy', 'tummy time'],
			'pumping': ['pumped', 'pump', 'pumping'],
			'temperature': ['temp', 'temperature', 'fever'],
			'weight': ['weight', 'weighed'],
			'height': ['height', 'length', 'measured'],
			'head-circumference': ['head circumference', 'head circ', 'head size'],
			'pain': ['pain', 'hurts', 'ache', 'cramp', 'cramping', 'sore', 'soreness'],
			'mood': ['mood', 'feeling', 'felt', 'emotional', 'anxious', 'anxiety', 'happy', 'sad', 'overwhelmed'],
			'walking': ['walked', 'walk', 'walking', 'steps'],
			'skin-to-skin': ['skin to skin', 'kangaroo', 'chest time'],
			'hiccups': ['hiccups', 'hiccup'],
			'bowel-movement': ['bowel', 'bm', 'pooped', 'constipated'],
			'bleeding': ['bleeding', 'spotting', 'lochia', 'bled'],
			'restroom': ['restroom', 'bathroom', 'peed', 'urinated', 'peeing'],
			'breastfeeding-position': ['position', 'cradle hold', 'football hold', 'cross cradle', 'laid back', 'side lying'],
			'cord-care': ['cord', 'umbilical', 'cord care', 'stump'],
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
	// Exclude matches followed by "ago" — those are time modifiers, not durations
	const pattern = /(\d+(?:\.\d+)?)\s*(h(?:ours?|r)?|m(?:in(?:utes?)?)?)/gi;
	let totalMs = 0;
	let match: RegExpExecArray | null;
	const parts: string[] = [];

	while ((match = pattern.exec(lower)) !== null) {
		// Check if this match is followed by "ago" — if so, skip it (time modifier)
		const afterMatch = lower.slice(match.index + match[0].length).trimStart();
		if (afterMatch.startsWith('ago')) continue;

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

/** Parse a bare numeric time like "1230" → {h:12, m:30} or "130" → {h:1, m:30} */
function parseBareTime(s: string): { h: number; m: number } | null {
	const n = parseInt(s, 10);
	if (isNaN(n) || n < 0) return null;
	if (s.length === 3 || s.length === 4) {
		// 130 → 1:30, 1230 → 12:30
		const m = n % 100;
		const h = Math.floor(n / 100);
		if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { h, m };
	}
	return null;
}

/** Parse a time string that may be "3pm", "3:30pm", "1430", "1230", or bare "130" */
function parseTimeStr(s: string): { h: number; m: number } | null {
	s = s.trim();
	// "3pm", "3:30pm", "14:30"
	const clockMatch = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
	if (clockMatch) {
		let h = parseInt(clockMatch[1], 10);
		const m = parseInt(clockMatch[2] || '0', 10);
		const ampm = clockMatch[3]?.toLowerCase();
		if (ampm === 'pm' && h < 12) h += 12;
		if (ampm === 'am' && h === 12) h = 0;
		return { h, m };
	}
	// Bare numeric: "1230", "130"
	return parseBareTime(s);
}

/** Build a Date from {h, m}, assuming today. If in the future, assume yesterday. */
function buildDate(hm: { h: number; m: number }): Date {
	const d = new Date();
	d.setHours(hm.h, hm.m, 0, 0);
	if (d.getTime() > Date.now()) {
		d.setDate(d.getDate() - 1);
	}
	return d;
}

interface TimeRange { start: string; end: string; durationMs: number; }

/**
 * Extract a time range from patterns like:
 *   "started at 1230 woke up at 130"
 *   "from 12:30 to 1:30"
 *   "12:30am-1:30am"
 *   "slept 1230 to 130"
 */
function extractTimeRange(lower: string): TimeRange | null {
	// Pattern: "started at X ... (woke up|ended|stopped|until|to|til|-) Y"
	const rangePatterns = [
		// "started at 1230 woke up at 130"
		/(?:started?|began?|from)\s+(?:at\s+)?(\d{3,4}|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:woke\s+up|ended?|stopped?|until|to|til|-)\s+(?:at\s+)?(\d{3,4}|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
		// "from X to Y" / "X to Y" / "X-Y"
		/(?:from\s+)?(\d{3,4}|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|til|until|thru)\s*(\d{3,4}|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
		// "woke up at Y" with "at X" earlier
		/(?:at\s+)(\d{3,4}|\d{1,2}(?::\d{2})?\s*(?:am|pm)?).*?(?:woke\s+up|ended?|stopped?)\s+(?:at\s+)?(\d{3,4}|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
	];

	for (const pattern of rangePatterns) {
		const match = lower.match(pattern);
		if (!match) continue;

		const startTime = parseTimeStr(match[1]);
		const endTime = parseTimeStr(match[2]);
		if (!startTime || !endTime) continue;

		// Check if either time has explicit AM/PM
		const startHasAmPm = /am|pm/i.test(match[1]);
		const endHasAmPm = /am|pm/i.test(match[2]);

		// Resolve start to the most recent past occurrence
		const startDate = buildDate(startTime);

		// For the end time, try multiple interpretations and pick the best one
		const candidates: Date[] = [];

		// Candidate 1: end time as-is on the same day as start
		const endSameDay = new Date(startDate);
		endSameDay.setHours(endTime.h, endTime.m, 0, 0);
		if (endSameDay.getTime() > startDate.getTime()) candidates.push(endSameDay);

		// Candidate 2: if no AM/PM on end, try adding 12h (PM interpretation)
		if (!endHasAmPm && endTime.h < 12) {
			const endPm = new Date(startDate);
			endPm.setHours(endTime.h + 12, endTime.m, 0, 0);
			if (endPm.getTime() > startDate.getTime()) candidates.push(endPm);
		}

		// Candidate 3: next day (for overnight ranges like 11pm to 2am)
		const endNextDay = new Date(startDate);
		endNextDay.setDate(endNextDay.getDate() + 1);
		endNextDay.setHours(endTime.h, endTime.m, 0, 0);
		if (endNextDay.getTime() > startDate.getTime()) candidates.push(endNextDay);

		if (candidates.length === 0) continue;

		// Pick the candidate with the shortest positive duration (most likely intent)
		candidates.sort((a, b) => (a.getTime() - startDate.getTime()) - (b.getTime() - startDate.getTime()));
		const endDate = candidates[0];

		const durationMs = endDate.getTime() - startDate.getTime();
		// Sanity: skip if duration > 24h or negative
		if (durationMs <= 0 || durationMs > 86400000) continue;

		return {
			start: startDate.toISOString(),
			end: endDate.toISOString(),
			durationMs,
		};
	}

	return null;
}

function extractTimeModifier(_tokens: string[], lower: string): string | null {
	// "yesterday at 10pm", "yesterday at 3:30am"
	const yesterdayAtMatch = lower.match(/yesterday\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (yesterdayAtMatch) {
		let h = parseInt(yesterdayAtMatch[1], 10);
		const m = parseInt(yesterdayAtMatch[2] || '0', 10);
		const ampm = yesterdayAtMatch[3]?.toLowerCase();
		if (ampm === 'pm' && h < 12) h += 12;
		if (ampm === 'am' && h === 12) h = 0;
		const d = new Date();
		d.setDate(d.getDate() - 1);
		d.setHours(h, m, 0, 0);
		return d.toISOString();
	}

	// "yesterday" (bare, no time — use current time minus 24h)
	if (/\byesterday\b/.test(lower) && !/yesterday\s+at/.test(lower)) {
		return new Date(Date.now() - 86400000).toISOString();
	}

	// "at 3pm", "at 3:30pm", "at 14:30", or bare "3pm", "2:30pm"
	// The "at" prefix is optional — "3pm" alone works too
	const atMatch = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
		|| lower.match(/at\s+(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm))?/i);
	if (atMatch) {
		let h = parseInt(atMatch[1], 10);
		const m = parseInt(atMatch[2] || '0', 10);
		const ampm = atMatch[3]?.toLowerCase();
		if (ampm === 'pm' && h < 12) h += 12;
		if (ampm === 'am' && h === 12) h = 0;
		// For "at 14:30" (no am/pm), h is already 24h format

		const d = new Date();
		d.setHours(h, m, 0, 0);
		// If the parsed time is in the future, assume the user means yesterday
		if (d.getTime() > Date.now()) {
			d.setDate(d.getDate() - 1);
		}
		return d.toISOString();
	}

	// "30 min ago", "2 hours ago"
	const agoMatch = lower.match(/(\d+(?:\.\d+)?)\s*(h(?:ours?|r)?|m(?:in(?:utes?)?)?)\s+ago/i);
	if (agoMatch) {
		const val = parseFloat(agoMatch[1]);
		const unit = agoMatch[2].toLowerCase();
		const ms = unit.startsWith('h') ? val * 3600000 : val * 60000;
		return new Date(Date.now() - ms).toISOString();
	}

	// Bare numeric time: "at 1230" → 12:30
	const bareMatch = lower.match(/at\s+(\d{3,4})(?!\s*(?:am|pm))/i);
	if (bareMatch) {
		const parsed = parseBareTime(bareMatch[1]);
		if (parsed) {
			return buildDate(parsed).toISOString();
		}
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
