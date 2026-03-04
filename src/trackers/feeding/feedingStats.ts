import type { FeedingEntry } from '../../types';
import { filterToday } from '../../data/dateUtils';

export interface FeedingStats {
	totalFeedings: number;
	totalDurationMin: number;
	leftCount: number;
	rightCount: number;
	bothCount: number;
	leftDurationMin: number;
	rightDurationMin: number;
	avgDurationMin: number;
	lastFeedingAgo: string | null;
	lastSide: string | null;
	activeFeeding: FeedingEntry | null;
}

/** Get duration in seconds for a completed feeding entry. */
export function getFeedingDuration(entry: FeedingEntry): number {
	if (entry.durationSec != null) return entry.durationSec;
	if (!entry.end) return 0;
	return Math.max(0, (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 1000);
}

/** Get elapsed seconds for an active (in-progress) feeding. */
export function getActiveElapsed(entry: FeedingEntry): number {
	if (entry.end) return getFeedingDuration(entry);
	return Math.max(0, (Date.now() - new Date(entry.start).getTime()) / 1000);
}

/** Compute feeding stats for today. */
export function computeFeedingStats(entries: FeedingEntry[], day: Date = new Date()): FeedingStats {
	const todayEntries = filterToday(entries, e => e.start, day);
	const completed = todayEntries.filter(e => e.end !== null);
	const active = todayEntries.find(e => e.end === null) || null;

	let leftCount = 0, rightCount = 0, bothCount = 0;
	let leftDurationSec = 0, rightDurationSec = 0;
	let totalDurationSec = 0;

	for (const e of completed) {
		const dur = getFeedingDuration(e);
		totalDurationSec += dur;
		switch (e.side) {
			case 'left':
				leftCount++;
				leftDurationSec += dur;
				break;
			case 'right':
				rightCount++;
				rightDurationSec += dur;
				break;
			case 'both':
				bothCount++;
				leftDurationSec += dur / 2;
				rightDurationSec += dur / 2;
				break;
		}
	}

	const totalFeedings = completed.length;
	const avgDurationSec = totalFeedings > 0 ? totalDurationSec / totalFeedings : 0;

	// Last feeding info
	let lastFeedingAgo: string | null = null;
	let lastSide: string | null = null;
	const lastCompleted = completed.length > 0 ? completed[completed.length - 1] : null;
	if (lastCompleted && lastCompleted.end) {
		const diffMin = Math.floor((Date.now() - new Date(lastCompleted.end).getTime()) / 60000);
		if (diffMin < 1) lastFeedingAgo = 'just now';
		else if (diffMin < 60) lastFeedingAgo = `${diffMin}m ago`;
		else {
			const h = Math.floor(diffMin / 60);
			const m = diffMin % 60;
			lastFeedingAgo = m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
		}
		lastSide = lastCompleted.side || null;
	}

	return {
		totalFeedings,
		totalDurationMin: Math.round(totalDurationSec / 60),
		leftCount,
		rightCount,
		bothCount,
		leftDurationMin: Math.round(leftDurationSec / 60),
		rightDurationMin: Math.round(rightDurationSec / 60),
		avgDurationMin: Math.round(avgDurationSec / 60),
		lastFeedingAgo,
		lastSide,
		activeFeeding: active,
	};
}
