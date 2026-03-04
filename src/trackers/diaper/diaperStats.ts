import type { DiaperEntry, DiaperColor, HealthAlert } from '../../types';
import { filterToday, daysSinceBirth, timeAgo } from '../../data/dateUtils';

export interface DiaperStats {
	totalWet: number;
	totalDirty: number;
	totalChanges: number;
	lastChangeAgo: string | null;
	colorBreakdown: Partial<Record<DiaperColor, number>>;
}

/** Compute diaper stats for a given day. */
export function computeDiaperStats(entries: DiaperEntry[], day: Date = new Date()): DiaperStats {
	const todayEntries = filterToday(entries, e => e.timestamp, day);

	let totalWet = 0;
	let totalDirty = 0;
	const colorBreakdown: Partial<Record<DiaperColor, number>> = {};

	for (const e of todayEntries) {
		if (e.wet) totalWet++;
		if (e.dirty) {
			totalDirty++;
			if (e.color) {
				colorBreakdown[e.color] = (colorBreakdown[e.color] || 0) + 1;
			}
		}
	}

	let lastChangeAgo: string | null = null;
	if (todayEntries.length > 0) {
		const last = todayEntries[todayEntries.length - 1];
		lastChangeAgo = timeAgo(last.timestamp);
	}

	return {
		totalWet,
		totalDirty,
		totalChanges: todayEntries.length,
		lastChangeAgo,
		colorBreakdown,
	};
}

/**
 * Get health alerts for diaper output.
 * Expected wet diapers by day of life:
 * Day 1: 1+, Day 2: 2+, Day 3: 3+, Day 4: 4+, Day 5+: 6+
 */
export function getDiaperAlerts(
	entries: DiaperEntry[],
	dayStart: Date,
	birthDate?: string,
	alertThreshold: number = 6
): HealthAlert[] {
	const alerts: HealthAlert[] = [];
	const stats = computeDiaperStats(entries, dayStart);

	// Determine expected wet diapers based on baby's age
	let expectedWet = alertThreshold;
	if (birthDate) {
		const dayOfLife = daysSinceBirth(birthDate);
		if (dayOfLife >= 0 && dayOfLife < 5) {
			expectedWet = Math.max(1, dayOfLife + 1); // Day 0: 1, Day 1: 2, etc.
		}
	}

	// Only alert if we're past a reasonable hour (after 6pm or late enough in the day)
	const hourOfDay = new Date().getHours();
	if (hourOfDay >= 18 && stats.totalWet < expectedWet) {
		alerts.push({
			level: stats.totalWet < expectedWet / 2 ? 'urgent' : 'warning',
			message: `Only ${stats.totalWet} wet diaper${stats.totalWet !== 1 ? 's' : ''} today (goal: ${expectedWet}+)`,
			detail: 'Insufficient wet diapers may indicate dehydration.',
		});
	}

	// No dirty diaper in 24h for newborns (first 6 weeks)
	if (birthDate) {
		const dayOfLife = daysSinceBirth(birthDate);
		if (dayOfLife >= 0 && dayOfLife <= 42 && stats.totalDirty === 0) {
			const todayEntries = filterToday(entries, e => e.timestamp, dayStart);
			// Only alert if there have been no dirty diapers at all today
			// and it's past noon
			if (hourOfDay >= 12 && todayEntries.every(e => !e.dirty)) {
				alerts.push({
					level: 'info',
					message: 'No dirty diapers logged today',
					detail: 'Breastfed newborns typically have 3-4 dirty diapers per day.',
				});
			}
		}
	}

	return alerts;
}
