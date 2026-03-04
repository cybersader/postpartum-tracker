import type { MedicationEntry, MedicationConfig, HealthAlert } from '../../types';
import { filterToday } from '../../data/dateUtils';

export interface MedDoseInfo {
	name: string;
	count: number;
	maxDailyDoses: number;
	lastTaken: string | null;        // ISO8601
	msSinceLastDose: number | null;
	minIntervalMs: number;
	nextSafeAt: string | null;       // ISO8601
	isSafe: boolean;
	riskPct: number;                 // 0-100, percentage of max daily doses used
}

export interface MedicationStats {
	doses: MedDoseInfo[];
	totalDoses: number;
	alternatingSchedule: string | null;
}

/** Compute medication stats for today. */
export function computeMedStats(
	entries: MedicationEntry[],
	configs: MedicationConfig[],
	day: Date = new Date()
): MedicationStats {
	const todayEntries = filterToday(entries, e => e.timestamp, day);
	const enabledConfigs = configs.filter(c => c.enabled);

	const doses: MedDoseInfo[] = enabledConfigs.map(config => {
		const medEntries = todayEntries.filter(
			e => e.name.toLowerCase() === config.name.toLowerCase()
		);
		const count = medEntries.length;
		const maxDailyDoses = config.maxDailyDoses || 999;

		// Find last dose (across all time, not just today)
		const allForMed = entries
			.filter(e => e.name.toLowerCase() === config.name.toLowerCase())
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		const lastEntry = allForMed.length > 0 ? allForMed[allForMed.length - 1] : null;

		const lastTaken = lastEntry?.timestamp || null;
		const msSinceLastDose = lastTaken ? Date.now() - new Date(lastTaken).getTime() : null;
		const minIntervalMs = config.minIntervalHours * 3600000;

		let isSafe = true;
		let nextSafeAt: string | null = null;
		if (msSinceLastDose !== null && msSinceLastDose < minIntervalMs) {
			isSafe = false;
			nextSafeAt = new Date(new Date(lastTaken!).getTime() + minIntervalMs).toISOString();
		}

		const riskPct = maxDailyDoses > 0 ? Math.min(100, Math.round((count / maxDailyDoses) * 100)) : 0;

		return {
			name: config.name,
			count,
			maxDailyDoses,
			lastTaken,
			msSinceLastDose,
			minIntervalMs,
			nextSafeAt,
			isSafe,
			riskPct,
		};
	});

	// Alternating schedule for pain meds (Tylenol + Ibuprofen)
	const alternatingSchedule = getAlternatingSchedule(entries, enabledConfigs);

	return {
		doses,
		totalDoses: todayEntries.length,
		alternatingSchedule,
	};
}

/**
 * Compute alternating pain med schedule.
 * If both Tylenol and Ibuprofen are enabled, show when the next dose of
 * the alternating med is due.
 */
export function getAlternatingSchedule(
	entries: MedicationEntry[],
	configs: MedicationConfig[]
): string | null {
	const painMeds = configs.filter(c =>
		c.enabled && ['tylenol', 'ibuprofen'].includes(c.name.toLowerCase())
	);
	if (painMeds.length < 2) return null;

	// Find last dose of each
	const lastDoses: { name: string; timestamp: Date; minIntervalMs: number }[] = [];
	for (const med of painMeds) {
		const medEntries = entries
			.filter(e => e.name.toLowerCase() === med.name.toLowerCase())
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		if (medEntries.length > 0) {
			lastDoses.push({
				name: med.name,
				timestamp: new Date(medEntries[medEntries.length - 1].timestamp),
				minIntervalMs: med.minIntervalHours * 3600000,
			});
		}
	}

	if (lastDoses.length === 0) return 'Take either Tylenol or Ibuprofen to start';
	if (lastDoses.length === 1) {
		const other = painMeds.find(m => m.name.toLowerCase() !== lastDoses[0].name.toLowerCase());
		if (other) {
			// The alternating med can be taken 3 hours after the last dose
			const nextTime = new Date(lastDoses[0].timestamp.getTime() + 3 * 3600000);
			if (nextTime.getTime() <= Date.now()) {
				return `${other.name} is safe to take now`;
			}
			const waitMin = Math.ceil((nextTime.getTime() - Date.now()) / 60000);
			const h = Math.floor(waitMin / 60);
			const m = waitMin % 60;
			const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
			return `Next: ${other.name} in ${timeStr}`;
		}
	}

	// Both have been taken -- find which one was taken most recently
	lastDoses.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
	const mostRecent = lastDoses[0];
	const other = painMeds.find(m => m.name.toLowerCase() !== mostRecent.name.toLowerCase());
	if (!other) return null;

	const nextTime = new Date(mostRecent.timestamp.getTime() + 3 * 3600000);
	if (nextTime.getTime() <= Date.now()) {
		return `${other.name} is safe to take now`;
	}
	const waitMin = Math.ceil((nextTime.getTime() - Date.now()) / 60000);
	const h = Math.floor(waitMin / 60);
	const m = waitMin % 60;
	const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
	return `Last: ${mostRecent.name}. Next: ${other.name} in ${timeStr}`;
}
