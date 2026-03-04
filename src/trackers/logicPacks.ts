/**
 * Logic pack definitions — configurable rule sets that define
 * "what's normal" for tracked variables by day/week of life.
 *
 * Each pack contains milestone rules that the evaluator checks
 * against actual tracker data to surface alerts and progress.
 */
import type { LogicPackDef } from '../types';

// ── Built-in Logic Packs ────────────────────────────────────

/**
 * First Week Newborn pack.
 * Based on Hancock Health "First Week Daily Breastfeeding Log"
 * and standard AAP newborn output guidelines.
 */
const FIRST_WEEK_NEWBORN: LogicPackDef = {
	id: 'first-week-newborn',
	displayName: 'First week newborn',
	description: 'Day-by-day diaper, feeding, and stool expectations for days 0-7. Based on AAP and lactation consultant guidelines.',
	target: 'baby',
	recommendedModules: ['feeding', 'diaper'],
	milestones: [
		// Day 0-1: minimum expectations
		{ moduleId: 'diaper', field: '_count_wet', fromDay: 0, toDay: 1, expect: { min: 1, perPeriod: 'day' }, alertLevel: 'warning', description: 'Expect at least 1 wet diaper', onTrackMessage: 'Wet diaper count on track' },
		{ moduleId: 'diaper', field: '_count_dirty', fromDay: 0, toDay: 1, expect: { min: 1, perPeriod: 'day' }, alertLevel: 'info', description: 'Expect at least 1 meconium stool', onTrackMessage: 'Stool output on track' },
		{ moduleId: 'diaper', field: 'color', fromDay: 0, toDay: 1, expect: { values: ['meconium'] }, alertLevel: 'info', description: 'Stool color should be meconium (black/dark green)' },
		{ moduleId: 'feeding', field: '_count', fromDay: 0, toDay: 1, expect: { min: 8, perPeriod: 'day' }, alertLevel: 'warning', description: 'Aim for 8+ feedings per day', onTrackMessage: 'Feeding frequency on track' },

		// Day 2
		{ moduleId: 'diaper', field: '_count_wet', fromDay: 2, toDay: 2, expect: { min: 2, perPeriod: 'day' }, alertLevel: 'warning', description: 'Expect at least 2 wet diapers', onTrackMessage: 'Wet diapers on track' },
		{ moduleId: 'diaper', field: '_count_dirty', fromDay: 2, toDay: 2, expect: { min: 2, perPeriod: 'day' }, alertLevel: 'info', description: 'Expect at least 2 stools', onTrackMessage: 'Stool output on track' },
		{ moduleId: 'feeding', field: '_count', fromDay: 2, toDay: 2, expect: { min: 8, perPeriod: 'day' }, alertLevel: 'warning', description: 'Aim for 8+ feedings per day', onTrackMessage: 'Feeding frequency on track' },

		// Day 3
		{ moduleId: 'diaper', field: '_count_wet', fromDay: 3, toDay: 3, expect: { min: 3, perPeriod: 'day' }, alertLevel: 'warning', description: 'Expect at least 3 wet diapers', onTrackMessage: 'Wet diapers on track' },
		{ moduleId: 'diaper', field: '_count_dirty', fromDay: 3, toDay: 3, expect: { min: 3, perPeriod: 'day' }, alertLevel: 'warning', description: 'Expect at least 3 stools', onTrackMessage: 'Stool output on track' },
		{ moduleId: 'diaper', field: 'color', fromDay: 3, toDay: 3, expect: { values: ['transitional', 'yellow-seedy'] }, alertLevel: 'info', description: 'Stool should be transitioning from meconium' },
		{ moduleId: 'feeding', field: '_count', fromDay: 3, toDay: 3, expect: { min: 8, perPeriod: 'day' }, alertLevel: 'warning', description: 'Aim for 8-12 feedings per day', onTrackMessage: 'Feeding frequency on track' },

		// Day 4
		{ moduleId: 'diaper', field: '_count_wet', fromDay: 4, toDay: 4, expect: { min: 4, perPeriod: 'day' }, alertLevel: 'warning', description: 'Expect at least 4 wet diapers', onTrackMessage: 'Wet diapers on track' },
		{ moduleId: 'diaper', field: '_count_dirty', fromDay: 4, toDay: 4, expect: { min: 3, perPeriod: 'day' }, alertLevel: 'warning', description: 'Expect at least 3 stools', onTrackMessage: 'Stool output on track' },
		{ moduleId: 'diaper', field: 'color', fromDay: 4, toDay: 4, expect: { values: ['yellow-seedy', 'transitional'] }, alertLevel: 'info', description: 'Stool color should be turning yellow-seedy' },
		{ moduleId: 'feeding', field: '_count', fromDay: 4, toDay: 4, expect: { min: 8, perPeriod: 'day' }, alertLevel: 'warning', description: 'Aim for 8-12 feedings per day', onTrackMessage: 'Feeding frequency on track' },

		// Day 5-7
		{ moduleId: 'diaper', field: '_count_wet', fromDay: 5, toDay: 7, expect: { min: 6, perPeriod: 'day' }, alertLevel: 'warning', description: 'Expect 6+ wet diapers per day', onTrackMessage: 'Wet diapers on track' },
		{ moduleId: 'diaper', field: '_count_dirty', fromDay: 5, toDay: 7, expect: { min: 3, perPeriod: 'day' }, alertLevel: 'warning', description: 'Expect 3-4+ stools per day', onTrackMessage: 'Stool output on track' },
		{ moduleId: 'diaper', field: 'color', fromDay: 5, toDay: 7, expect: { values: ['yellow-seedy'] }, alertLevel: 'info', description: 'Stool should be yellow and seedy by now' },
		{ moduleId: 'feeding', field: '_count', fromDay: 5, toDay: 7, expect: { min: 8, perPeriod: 'day' }, alertLevel: 'warning', description: 'Maintain 8-12 feedings per day', onTrackMessage: 'Feeding frequency on track' },
	],
};

/**
 * Postpartum Recovery pack (mother focus).
 */
const POSTPARTUM_RECOVERY: LogicPackDef = {
	id: 'postpartum-recovery',
	displayName: 'Postpartum recovery',
	description: 'Recovery milestones for the mother: pain management, bowel movements, walking, and mood monitoring.',
	target: 'mother',
	recommendedModules: ['medication', 'bowel-movements', 'walking', 'pain', 'mood'],
	milestones: [
		// Day 0-3: early recovery
		{ moduleId: 'pain', field: '_count', fromDay: 0, toDay: 3, expect: { min: 1, perPeriod: 'day' }, alertLevel: 'info', description: 'Log pain level at least once daily', onTrackMessage: 'Pain tracking on track' },
		{ moduleId: 'medication', field: '_count', fromDay: 0, toDay: 3, expect: { min: 1, perPeriod: 'day' }, alertLevel: 'info', description: 'Stay on top of pain medication schedule', onTrackMessage: 'Medication on schedule' },
		{ moduleId: 'walking', field: '_count', fromDay: 1, toDay: 3, expect: { min: 1, perPeriod: 'day' }, alertLevel: 'info', description: 'Try to walk at least once daily for circulation', onTrackMessage: 'Walking goal met' },

		// Day 3-7: bowel function + pain trend
		{ moduleId: 'bowel-movements', field: '_count', fromDay: 0, toDay: 3, expect: { min: 1 }, alertLevel: 'warning', description: 'First postpartum bowel movement expected by day 3', onTrackMessage: 'Bowel function restored' },
		{ moduleId: 'walking', field: '_count', fromDay: 4, toDay: 7, expect: { min: 2, perPeriod: 'day' }, alertLevel: 'info', description: 'Increase walking — aim for 2+ walks daily', onTrackMessage: 'Walking increasing' },
		{ moduleId: 'mood', field: '_count', fromDay: 3, toDay: 7, expect: { min: 1, perPeriod: 'day' }, alertLevel: 'info', description: 'Check in on mood daily — baby blues peak around days 3-5', onTrackMessage: 'Mood tracked' },

		// Week 2-6: ongoing recovery
		{ moduleId: 'mood', field: '_count', fromDay: 14, toDay: 42, expect: { min: 1, perPeriod: 'day' }, alertLevel: 'warning', description: 'Continue daily mood monitoring — seek help if symptoms persist beyond 2 weeks', onTrackMessage: 'Mood tracking on track' },
		{ moduleId: 'walking', field: '_count', fromDay: 14, toDay: 42, expect: { min: 2, perPeriod: 'day' }, alertLevel: 'info', description: 'Maintain regular walking for recovery', onTrackMessage: 'Activity level good' },
	],
};

/**
 * Breastfeeding Establishment pack (feeding focus weeks 1-8).
 */
const BREASTFEEDING_ESTABLISHMENT: LogicPackDef = {
	id: 'breastfeeding-establishment',
	displayName: 'Breastfeeding establishment',
	description: 'Feeding frequency and duration targets for establishing milk supply over weeks 1-8.',
	target: 'baby',
	recommendedModules: ['feeding'],
	milestones: [
		// Week 1: frequent feeding
		{ moduleId: 'feeding', field: '_count', fromDay: 0, toDay: 7, expect: { min: 8, max: 12, perPeriod: 'day' }, alertLevel: 'warning', description: 'Feed 8-12 times per 24 hours to establish supply', onTrackMessage: 'Feeding frequency excellent' },

		// Week 2-4: stabilizing
		{ moduleId: 'feeding', field: '_count', fromDay: 8, toDay: 28, expect: { min: 8, perPeriod: 'day' }, alertLevel: 'warning', description: 'Maintain 8+ feedings per day while supply establishes', onTrackMessage: 'Feeding frequency on track' },

		// Month 2+: established
		{ moduleId: 'feeding', field: '_count', fromDay: 29, toDay: 56, expect: { min: 6, perPeriod: 'day' }, alertLevel: 'info', description: 'Feeding pattern should be well established — typically 6-8 feeds/day', onTrackMessage: 'Feeding pattern established' },
	],
};

// ── Registry ────────────────────────────────────────────────

/** All built-in logic packs. */
export const LOGIC_PACKS: LogicPackDef[] = [
	FIRST_WEEK_NEWBORN,
	POSTPARTUM_RECOVERY,
	BREASTFEEDING_ESTABLISHMENT,
];

/** Get a logic pack by ID. */
export function getLogicPack(id: string): LogicPackDef | undefined {
	return LOGIC_PACKS.find(p => p.id === id);
}

/** Get all packs matching the given IDs. */
export function getLogicPacks(ids: string[]): LogicPackDef[] {
	return ids.map(id => getLogicPack(id)).filter((p): p is LogicPackDef => !!p);
}
