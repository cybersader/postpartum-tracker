/**
 * Evaluates logic pack milestone rules against actual tracker data.
 * Returns pass/fail status for each applicable rule.
 */
import type {
	PostpartumData, LogicPackDef, MilestoneRule, MilestoneStatus,
	FeedingEntry, DiaperEntry, MedicationEntry, SimpleTrackerEntry,
} from '../types';
import { getDayStart, getDayEnd } from '../data/dateUtils';

/**
 * Evaluate all milestone rules from the given packs against current data.
 *
 * @param data The code block's PostpartumData
 * @param packs Active logic packs to evaluate
 * @param dayOfLife Current day of life (0-indexed, where 0 = birth day)
 * @returns Array of milestone statuses for rules matching the current day
 */
export function evaluateMilestones(
	data: PostpartumData,
	packs: LogicPackDef[],
	dayOfLife: number
): MilestoneStatus[] {
	const results: MilestoneStatus[] = [];
	const dayStartDate = getDayStart();
	const dayEndDate = getDayEnd();
	const dayStartISO = dayStartDate.toISOString();
	const dayEndISO = dayEndDate.toISOString();

	for (const pack of packs) {
		for (const rule of pack.milestones) {
			// Only evaluate rules that apply to the current day
			if (dayOfLife < rule.fromDay || dayOfLife > rule.toDay) continue;

			const status = evaluateRule(rule, data, dayStartISO, dayEndISO, dayOfLife);
			results.push(status);
		}
	}

	return results;
}

/** Evaluate a single milestone rule. */
function evaluateRule(
	rule: MilestoneRule,
	data: PostpartumData,
	dayStart: string,
	dayEnd: string,
	_dayOfLife: number
): MilestoneStatus {
	const field = rule.field;

	// Count-based rules
	if (field === '_count' || field === '_count_wet' || field === '_count_dirty') {
		const count = countEntries(rule.moduleId, field, data, dayStart, dayEnd, rule);
		return evaluateNumeric(rule, count);
	}

	// Duration average
	if (field === '_duration_avg') {
		const avg = avgDuration(rule.moduleId, data, dayStart, dayEnd);
		return evaluateNumeric(rule, avg);
	}

	// Color / select field rules (check most recent entries today)
	if (rule.expect.values) {
		const colors = getFieldValues(rule.moduleId, field, data, dayStart, dayEnd);
		return evaluateValues(rule, colors);
	}

	// Fallback: treat as count
	const count = countEntries(rule.moduleId, field, data, dayStart, dayEnd, rule);
	return evaluateNumeric(rule, count);
}

/** Count entries for a module within the day range. */
function countEntries(
	moduleId: string,
	field: string,
	data: PostpartumData,
	dayStart: string,
	dayEnd: string,
	rule: MilestoneRule
): number {
	const raw = data.trackers[moduleId];
	if (!raw || !Array.isArray(raw)) return 0;

	// If the rule spans multiple days with no perPeriod, count total across the full range
	const isPeriodic = rule.expect.perPeriod === 'day' || rule.expect.perPeriod === '24h';

	const entries = (raw as Array<Record<string, unknown>>).filter(e => {
		const ts = (e.timestamp || e.start) as string | undefined;
		if (!ts) return false;
		if (isPeriodic) {
			return ts >= dayStart && ts <= dayEnd;
		}
		// For non-periodic (cumulative) rules, count from birth to now
		return ts <= dayEnd;
	});

	if (field === '_count') return entries.length;

	if (field === '_count_wet' && moduleId === 'diaper') {
		return entries.filter(e => e.wet === true).length;
	}

	if (field === '_count_dirty' && moduleId === 'diaper') {
		return entries.filter(e => e.dirty === true).length;
	}

	return entries.length;
}

/** Average duration of entries today (seconds). */
function avgDuration(
	moduleId: string,
	data: PostpartumData,
	dayStart: string,
	dayEnd: string
): number {
	const raw = data.trackers[moduleId];
	if (!raw || !Array.isArray(raw)) return 0;

	const entries = (raw as Array<Record<string, unknown>>).filter(e => {
		const ts = (e.timestamp || e.start) as string | undefined;
		return ts && ts >= dayStart && ts <= dayEnd;
	});

	const durations = entries
		.map(e => (e.durationSec as number) ?? 0)
		.filter(d => d > 0);

	if (durations.length === 0) return 0;
	return durations.reduce((a, b) => a + b, 0) / durations.length;
}

/** Get unique field values from today's entries. */
function getFieldValues(
	moduleId: string,
	field: string,
	data: PostpartumData,
	dayStart: string,
	dayEnd: string
): string[] {
	const raw = data.trackers[moduleId];
	if (!raw || !Array.isArray(raw)) return [];

	const entries = (raw as Array<Record<string, unknown>>).filter(e => {
		const ts = (e.timestamp || e.start) as string | undefined;
		return ts && ts >= dayStart && ts <= dayEnd;
	});

	const values = new Set<string>();
	for (const e of entries) {
		// Check direct field on entry (e.g., DiaperEntry.color)
		const val = e[field];
		if (typeof val === 'string' && val) {
			values.add(val);
		}
		// Check nested fields (SimpleTrackerEntry.fields.xxx)
		const fields = e.fields as Record<string, unknown> | undefined;
		if (fields && typeof fields[field] === 'string') {
			values.add(fields[field] as string);
		}
	}

	return [...values];
}

/** Evaluate a numeric actual value against a rule's expect range. */
function evaluateNumeric(rule: MilestoneRule, actual: number): MilestoneStatus {
	let met = true;
	if (rule.expect.min !== undefined && actual < rule.expect.min) met = false;
	if (rule.expect.max !== undefined && actual > rule.expect.max) met = false;

	const message = met
		? rule.onTrackMessage || `${rule.description} - on track`
		: rule.description;

	return { rule, actual, met, message };
}

/** Evaluate string values against expected values. */
function evaluateValues(rule: MilestoneRule, actual: string[]): MilestoneStatus {
	const expected = rule.expect.values || [];
	// Met if at least one actual value matches any expected value
	const met = actual.length === 0
		? false // No data = not met (but could be info-level)
		: actual.some(v => expected.includes(v));

	const message = met
		? rule.onTrackMessage || `${rule.description} - on track`
		: rule.description;

	return { rule, actual, met, message };
}
