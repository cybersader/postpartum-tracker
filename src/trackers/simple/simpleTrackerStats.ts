/**
 * Stats computation for simple (data-driven) trackers.
 */

import type { SimpleTrackerEntry } from '../../types';
import { filterToday } from '../../data/dateUtils';
import { timeAgo } from '../../data/dateUtils';

export interface SimpleTrackerStats {
	todayCount: number;
	lastTimestamp: string | null;
	lastAgo: string | null;
	/** Last numeric value (for measurement trackers like weight/temp) */
	lastValue?: number;
	/** Total duration in seconds for duration-based trackers */
	totalDurationSec: number;
}

export function computeSimpleTrackerStats(
	entries: SimpleTrackerEntry[],
	dayStart: Date = new Date(),
	numericFieldKey?: string
): SimpleTrackerStats {
	const todayEntries = filterToday(entries, e => e.timestamp, dayStart);
	const sorted = [...entries].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
	);
	const last = sorted.length > 0 ? sorted[sorted.length - 1] : null;

	let totalDurationSec = 0;
	for (const e of todayEntries) {
		if (e.durationSec) totalDurationSec += e.durationSec;
	}

	let lastValue: number | undefined;
	if (numericFieldKey && last) {
		const v = last.fields[numericFieldKey];
		if (typeof v === 'number') lastValue = v;
	}

	return {
		todayCount: todayEntries.length,
		lastTimestamp: last?.timestamp ?? null,
		lastAgo: last ? timeAgo(last.timestamp) : null,
		lastValue,
		totalDurationSec,
	};
}
