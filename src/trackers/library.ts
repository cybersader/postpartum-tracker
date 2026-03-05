/**
 * Tracker Library — Catalog of all available simple (data-driven) tracker definitions.
 * Each definition can be instantiated as a SimpleTrackerModule without custom code.
 *
 * Core modules (feeding, diaper, medication) have dedicated TrackerModule classes
 * and are NOT listed here — they are registered separately in main.ts.
 */

import type { SimpleTrackerDef, TrackerCategory } from '../types';

/** IDs of built-in modules with dedicated TrackerModule classes. */
export const BUILTIN_MODULE_IDS = ['feeding', 'diaper', 'medication', 'comments'] as const;

/** Category display metadata for the settings UI. */
export const TRACKER_CATEGORIES: Record<TrackerCategory, { label: string; description: string }> = {
	'baby-care': {
		label: 'Baby care',
		description: 'Core baby tracking (feeding, diapers, medication)',
	},
	'baby-development': {
		label: 'Baby development',
		description: 'Growth, sleep, and developmental milestones',
	},
	'mother-recovery': {
		label: "Mother\u2019s recovery",
		description: 'Postpartum recovery tracking',
	},
	'general': {
		label: 'General',
		description: 'Mood, notes, and general tracking',
	},
};

/**
 * All available simple tracker definitions.
 * Users can enable/disable these in settings.
 */
export const TRACKER_LIBRARY: SimpleTrackerDef[] = [

	// ── Baby Development ──────────────────────────────────────

	{
		id: 'sleep',
		displayName: 'Sleep',
		category: 'baby-development',
		icon: '\uD83D\uDE34',   // sleeping face
		description: 'Track naps and nighttime sleep with start/end times',
		isSmart: true,
		fields: [
			{ key: 'type', label: 'Type', type: 'select', options: ['nap', 'night'], required: true, collectOn: 'start' },
			{ key: 'quality', label: 'Quality', type: 'rating', min: 1, max: 5, collectOn: 'stop' },
			{ key: 'location', label: 'Location', type: 'select', options: ['crib', 'bassinet', 'cosleep', 'swing', 'arms', 'other'], collectOn: 'start' },
		],
		defaultOrder: 10,
		hasDuration: true,
		notificationConfig: {
			reminderEnabled: true,
			reminderIntervalHours: 3,
			reminderMessage: 'Baby has been awake for a while \u2014 consider a nap',
		},
	},
	{
		id: 'tummy-time',
		displayName: 'Tummy time',
		category: 'baby-development',
		icon: '\uD83D\uDC76',   // baby
		description: 'Track tummy time sessions with milestone notes',
		isSmart: false,
		fields: [
			{ key: 'milestone', label: 'Milestone', type: 'text', placeholder: 'Lifted head, rolled over, etc.', collectOn: 'stop' },
		],
		defaultOrder: 11,
		hasDuration: true,
	},
	{
		id: 'weight',
		displayName: 'Weight',
		category: 'baby-development',
		icon: '\u2696\uFE0F',   // scales
		description: 'Periodic weight measurements',
		isSmart: false,
		fields: [
			{ key: 'value', label: 'Weight', type: 'number', unit: 'g', required: true },
		],
		defaultOrder: 12,
	},
	{
		id: 'height',
		displayName: 'Height/length',
		category: 'baby-development',
		icon: '\uD83D\uDCCF',   // ruler
		description: 'Periodic height or length measurements',
		isSmart: false,
		fields: [
			{ key: 'value', label: 'Length', type: 'number', unit: 'cm', required: true },
		],
		defaultOrder: 13,
	},
	{
		id: 'head-circumference',
		displayName: 'Head circumference',
		category: 'baby-development',
		icon: '\uD83E\uDDE0',   // brain
		description: 'Periodic head circumference measurements',
		isSmart: false,
		fields: [
			{ key: 'value', label: 'Circumference', type: 'number', unit: 'cm', required: true },
		],
		defaultOrder: 14,
	},
	{
		id: 'temperature',
		displayName: 'Temperature',
		category: 'baby-development',
		icon: '\uD83C\uDF21\uFE0F',  // thermometer
		description: 'Temperature readings with method',
		isSmart: true,
		fields: [
			{ key: 'value', label: 'Temperature', type: 'number', unit: '\u00B0F', required: true },
			{ key: 'method', label: 'Method', type: 'select', options: ['rectal', 'axillary', 'temporal', 'oral'] },
		],
		defaultOrder: 15,
		notificationConfig: {
			reminderEnabled: false,
			reminderIntervalHours: 4,
			reminderMessage: 'Time to check temperature',
		},
	},

	{
		id: 'hiccups',
		displayName: 'Hiccups',
		category: 'baby-development',
		icon: '\uD83D\uDE2E',   // open mouth face
		description: 'Quick-log baby hiccup episodes',
		isSmart: false,
		fields: [],
		defaultOrder: 16,
	},

	// ── Mother's Recovery ─────────────────────────────────────

	{
		id: 'pain',
		displayName: 'Pain tracking',
		category: 'mother-recovery',
		icon: '\uD83E\uDE79',   // adhesive bandage
		description: 'Rate pain level, location, and type',
		isSmart: false,
		fields: [
			{ key: 'level', label: 'Pain level', type: 'rating', min: 1, max: 10, required: true },
			{ key: 'location', label: 'Location', type: 'select', options: ['perineum', 'abdomen', 'back', 'breast', 'head', 'other'] },
			{ key: 'type', label: 'Type', type: 'select', options: ['sharp', 'dull', 'throbbing', 'burning', 'pressure'] },
		],
		defaultOrder: 20,
	},
	{
		id: 'bowel-movement',
		displayName: 'Bowel movements',
		category: 'mother-recovery',
		icon: '\uD83D\uDEBD',   // toilet
		description: 'Track postpartum bowel movements \u2014 important recovery milestone',
		isSmart: true,
		fields: [
			{ key: 'difficulty', label: 'Difficulty', type: 'rating', min: 1, max: 5 },
		],
		defaultOrder: 21,
		notificationConfig: {
			reminderEnabled: true,
			reminderIntervalHours: 24,
			reminderMessage: 'Have you had a bowel movement today?',
		},
	},
	{
		id: 'restroom',
		displayName: 'Restroom visits',
		category: 'mother-recovery',
		icon: '\uD83D\uDEBB',   // restroom
		description: 'Track frequency of restroom visits',
		isSmart: false,
		fields: [
			{ key: 'type', label: 'Type', type: 'select', options: ['urination', 'other'] },
		],
		defaultOrder: 22,
	},
	{
		id: 'walking',
		displayName: 'Walking/activity',
		category: 'mother-recovery',
		icon: '\uD83D\uDEB6',   // person walking
		description: 'Track walks and physical activity',
		isSmart: false,
		fields: [
			{ key: 'distance', label: 'Distance', type: 'text', placeholder: 'e.g., around the block', collectOn: 'stop' },
		],
		defaultOrder: 23,
		hasDuration: true,
	},
	{
		id: 'pumping',
		displayName: 'Pumping sessions',
		category: 'mother-recovery',
		icon: '\uD83C\uDF7C',   // baby bottle
		description: 'Track breast pumping with amount and side',
		isSmart: true,
		fields: [
			{ key: 'side', label: 'Side', type: 'select', options: ['left', 'right', 'both'], required: true, collectOn: 'start' },
			{ key: 'amountMl', label: 'Amount', type: 'number', unit: 'ml', collectOn: 'stop' },
		],
		defaultOrder: 24,
		hasDuration: true,
		notificationConfig: {
			reminderEnabled: true,
			reminderIntervalHours: 3,
			reminderMessage: 'Time to pump',
		},
	},
	{
		id: 'breastfeeding-position',
		displayName: 'Feeding position',
		category: 'mother-recovery',
		icon: '\uD83E\uDD31',   // breastfeeding
		description: 'Track which breastfeeding positions were used',
		isSmart: false,
		fields: [
			{ key: 'position', label: 'Position', type: 'select', options: ['cradle', 'cross-cradle', 'football', 'side-lying', 'laid-back', 'other'], required: true },
		],
		defaultOrder: 25,
	},

	{
		id: 'bleeding',
		displayName: 'Bleeding/lochia',
		category: 'mother-recovery',
		icon: '\uD83E\uDE78',   // drop of blood
		description: 'Track postpartum bleeding — amount, color, and clots',
		isSmart: true,
		fields: [
			{ key: 'amount', label: 'Amount', type: 'select', options: ['light', 'moderate', 'heavy'], required: true },
			{ key: 'color', label: 'Color', type: 'select', options: ['bright red', 'dark red', 'pink', 'brown', 'yellow'] },
			{ key: 'clots', label: 'Clots', type: 'boolean' },
		],
		defaultOrder: 26,
		notificationConfig: {
			reminderEnabled: true,
			reminderIntervalHours: 12,
			reminderMessage: 'Log your bleeding/lochia status',
		},
	},
	{
		id: 'skin-to-skin',
		displayName: 'Skin-to-skin',
		category: 'baby-care',
		icon: '\uD83E\uDD32',   // palms up
		description: 'Track skin-to-skin contact sessions',
		isSmart: false,
		fields: [],
		defaultOrder: 28,
		hasDuration: true,
	},
	{
		id: 'cord-care',
		displayName: 'Cord care',
		category: 'baby-care',
		icon: '\uD83E\uDE79',   // adhesive bandage
		description: 'Track umbilical cord care and observations',
		isSmart: false,
		fields: [
			{ key: 'status', label: 'Status', type: 'select', options: ['normal', 'redness', 'discharge', 'fell off'] },
		],
		defaultOrder: 29,
	},

	// ── General ───────────────────────────────────────────────

	{
		id: 'mood',
		displayName: 'Mood check-in',
		category: 'general',
		icon: '\uD83D\uDE0A',   // smiling face
		description: 'Track emotional state and well-being',
		isSmart: true,
		fields: [
			{ key: 'mood', label: 'Mood', type: 'rating', min: 1, max: 5, required: true },
			{ key: 'feeling', label: 'Feeling', type: 'select', options: ['happy', 'calm', 'tired', 'anxious', 'sad', 'frustrated', 'overwhelmed', 'grateful'] },
		],
		defaultOrder: 30,
		notificationConfig: {
			reminderEnabled: true,
			reminderIntervalHours: 8,
			reminderMessage: 'How are you feeling?',
		},
	},
];
