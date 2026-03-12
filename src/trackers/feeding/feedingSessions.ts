/**
 * Group consecutive breast-feeding entries into logical sessions for analytics.
 * A "session" = consecutive breast entries where the gap between one's end
 * and the next's start is within the threshold. Bottle/solid entries and
 * active (running) entries are always their own session.
 */
import type { FeedingEntry, FeedingSession } from '../../types';

export function groupIntoSessions(
	entries: FeedingEntry[],
	gapThresholdMs: number,
): FeedingSession[] {
	if (entries.length === 0) return [];

	// Sort by start ascending (defensive)
	const sorted = [...entries].sort(
		(a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
	);

	const sessions: FeedingSession[] = [];
	let currentGroup: FeedingEntry[] = [];

	function flushGroup(): void {
		if (currentGroup.length === 0) return;
		const first = currentGroup[0];
		const last = currentGroup[currentGroup.length - 1];
		sessions.push({
			entries: [...currentGroup],
			start: first.start,
			end: last.end,
			totalDurationSec: currentGroup.reduce((sum, e) => sum + getDurSec(e), 0),
			lastSide: last.side,
		});
		currentGroup = [];
	}

	for (const entry of sorted) {
		// Non-breast or active entries are always their own session
		if (entry.type !== 'breast' || entry.end === null) {
			flushGroup();
			sessions.push({
				entries: [entry],
				start: entry.start,
				end: entry.end,
				totalDurationSec: getDurSec(entry),
				lastSide: entry.side,
			});
			continue;
		}

		// Breast entry with end — try to group with current
		if (currentGroup.length === 0) {
			currentGroup.push(entry);
			continue;
		}

		const lastInGroup = currentGroup[currentGroup.length - 1];
		if (lastInGroup.end === null) {
			// Previous was active (shouldn't happen after filter above, but be safe)
			flushGroup();
			currentGroup.push(entry);
			continue;
		}

		const gap = new Date(entry.start).getTime() - new Date(lastInGroup.end).getTime();
		if (gap <= gapThresholdMs) {
			currentGroup.push(entry);
		} else {
			flushGroup();
			currentGroup.push(entry);
		}
	}

	flushGroup();
	return sessions;
}

function getDurSec(e: FeedingEntry): number {
	if (e.durationSec != null) return e.durationSec;
	if (!e.end) return 0;
	return Math.max(0, (new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000);
}
