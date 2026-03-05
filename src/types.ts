/**
 * All interfaces, type definitions, and default values for the
 * Postpartum Tracker plugin.
 */

// ── Entry Types ──────────────────────────────────────────────

/** A single feeding event. */
export interface FeedingEntry {
	id: string;
	type: 'breast' | 'bottle' | 'solid';
	side?: 'left' | 'right' | 'both';
	start: string;            // ISO8601
	end: string | null;       // null = actively feeding (timer running)
	durationSec?: number;     // Cached for completed entries
	volumeMl?: number;        // For bottle feeding (future)
	notes: string;
}

/** A single diaper change event. */
export interface DiaperEntry {
	id: string;
	timestamp: string;        // ISO8601
	wet: boolean;
	dirty: boolean;
	color?: DiaperColor;
	description: string;      // Custom description (e.g., consistency, smell, concerns)
	notes: string;
}

export type DiaperColor =
	| 'meconium'          // Black/dark green (days 1-2)
	| 'transitional'      // Dark green to brown (days 3-4)
	| 'yellow-seedy'      // Normal breastfed (day 4+)
	| 'green'             // Can indicate foremilk/hindmilk imbalance
	| 'brown'             // Normal formula-fed
	| 'other';

/** A single medication dose event. */
export interface MedicationEntry {
	id: string;
	name: string;             // 'Tylenol' | 'Ibuprofen' | custom
	dosage?: string;          // '500mg', '200mg'
	timestamp: string;        // ISO8601
	notes: string;
}

/** A custom log note (general-purpose entry). */
export interface LogNoteEntry {
	id: string;
	timestamp: string;        // ISO8601
	category: string;         // User-defined category or 'general'
	text: string;
}

// ── Simple Tracker Library ──────────────────────────────────

export type TrackerCategory = 'baby-care' | 'baby-development' | 'mother-recovery' | 'general';

/** Field definition for a simple (data-driven) tracker. */
export interface SimpleTrackerField {
	key: string;
	label: string;
	type: 'text' | 'number' | 'select' | 'boolean' | 'datetime' | 'rating';
	options?: string[];       // For 'select' type
	required?: boolean;
	placeholder?: string;
	unit?: string;            // Display unit (e.g., 'cm', 'kg', 'F')
	min?: number;
	max?: number;
	/** When to collect this field for duration trackers. Default: 'start' for duration, 'log' for non-duration. */
	collectOn?: 'start' | 'stop' | 'log' | 'always';
}

/** Definition for a data-driven tracker in the library. */
export interface SimpleTrackerDef {
	id: string;
	displayName: string;
	category: TrackerCategory;
	icon: string;
	description: string;
	isSmart: boolean;         // Has notification/alert logic
	fields: SimpleTrackerField[];
	defaultOrder: number;
	hasDuration?: boolean;    // Shows start/end timer
	notificationConfig?: {
		reminderEnabled: boolean;
		reminderIntervalHours: number;
		reminderMessage: string;
	};
}

/** A generic entry for simple (library) trackers. */
export interface SimpleTrackerEntry {
	id: string;
	timestamp: string;        // ISO8601
	end?: string | null;      // For duration-based trackers
	durationSec?: number;
	fields: Record<string, string | number | boolean>;
	notes: string;
}

// ── Logic Packs (Milestone Rules) ────────────────────────────

/** A single milestone expectation within a logic pack. */
export interface MilestoneRule {
	/** Which tracker module this rule applies to */
	moduleId: string;
	/** Which field to evaluate: '_count' for entry count, '_duration_avg' for avg duration,
	 *  or a specific field key from the tracker's entries (e.g., 'color' for diaper). */
	field: string;
	/** Day of life range this rule applies (inclusive, 0-indexed) */
	fromDay: number;
	toDay: number;
	/** Expected value or range */
	expect: {
		min?: number;
		max?: number;
		/** Expected select values (e.g., ['yellow-seedy']) */
		values?: string[];
		/** Period for count-based rules */
		perPeriod?: 'day' | '24h';
	};
	/** Alert level when expectation not met */
	alertLevel: 'info' | 'warning' | 'urgent';
	/** Human-readable description of what's expected */
	description: string;
	/** Message shown when expectation IS met (positive reinforcement) */
	onTrackMessage?: string;
}

/** A logic pack definition. */
export interface LogicPackDef {
	id: string;
	displayName: string;
	description: string;
	/** Who this pack is for */
	target: 'baby' | 'mother' | 'both';
	/** Recommended trackers to enable with this pack */
	recommendedModules: string[];
	/** Time-based milestone rules */
	milestones: MilestoneRule[];
}

/** Result of evaluating a single milestone rule against actual data. */
export interface MilestoneStatus {
	rule: MilestoneRule;
	actual: number | string[];
	met: boolean;
	message: string;
}

// ── Medication Config ────────────────────────────────────────

export type MedicationCategory = 'medication' | 'remedy';

export interface MedicationConfig {
	name: string;
	technicalName?: string;       // Generic/chemical name (e.g., 'Acetaminophen' for Tylenol)
	description?: string;         // Brief description of what this medication is for
	dosage: string;
	minIntervalHours: number;   // Minimum hours between doses
	maxDailyDoses: number;      // Max doses per 24h (0 = unlimited)
	enabled: boolean;
	icon: string;               // Emoji or character
	category?: MedicationCategory; // 'medication' (default) or 'remedy' (topical/external)
}

export const DEFAULT_MEDICATIONS: MedicationConfig[] = [
	// Pain medications
	{ name: 'Tylenol', technicalName: 'Acetaminophen', description: 'Pain reliever and fever reducer', dosage: '500mg', minIntervalHours: 6, maxDailyDoses: 4, enabled: true, icon: '\uD83D\uDC8A', category: 'medication' },
	{ name: 'Ibuprofen', technicalName: 'Ibuprofen', description: 'Anti-inflammatory pain reliever', dosage: '800mg', minIntervalHours: 8, maxDailyDoses: 3, enabled: true, icon: '\uD83D\uDC8A', category: 'medication' },
	{ name: 'Hydrocodone-Acetamin', technicalName: 'Hydrocodone/Acetaminophen', description: 'Prescription opioid pain reliever', dosage: '5-325mg (half pill)', minIntervalHours: 12, maxDailyDoses: 2, enabled: false, icon: '\uD83D\uDC8A', category: 'medication' },
	// Supplements
	{ name: 'Stool softener', technicalName: 'Docusate sodium', description: 'Prevents constipation (Colace)', dosage: '100mg', minIntervalHours: 12, maxDailyDoses: 2, enabled: false, icon: '\uD83D\uDC8A', category: 'medication' },
	{ name: 'Prenatal vitamin', technicalName: '', description: 'Daily prenatal nutritional supplement', dosage: '2 gummies', minIntervalHours: 24, maxDailyDoses: 1, enabled: false, icon: '\uD83D\uDC8A', category: 'medication' },
	{ name: 'Iron', technicalName: 'Ferrous sulfate', description: 'Iron supplement for anemia', dosage: '324mg', minIntervalHours: 48, maxDailyDoses: 1, enabled: false, icon: '\uD83D\uDC8A', category: 'medication' },
	// Topical remedies / perineal care
	{ name: 'Dermoplast', technicalName: 'Benzocaine/Menthol spray', description: 'Numbing spray for perineal pain', dosage: '', minIntervalHours: 4, maxDailyDoses: 0, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
	{ name: 'Lidocaine cream', technicalName: 'Lidocaine topical', description: 'Topical numbing cream', dosage: '', minIntervalHours: 4, maxDailyDoses: 0, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
	{ name: 'EMLA cream', technicalName: 'Lidocaine/Prilocaine', description: 'Prescription topical numbing cream', dosage: '', minIntervalHours: 4, maxDailyDoses: 0, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
	{ name: 'Proctofoam', technicalName: 'Pramoxine/Hydrocortisone', description: 'Hemorrhoid/perineal anti-itch foam', dosage: '', minIntervalHours: 6, maxDailyDoses: 4, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
	{ name: 'Witch hazel pads', technicalName: 'Tucks pads', description: 'Soothing anti-inflammatory pads', dosage: '', minIntervalHours: 0, maxDailyDoses: 0, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
	{ name: 'Nipple cream', technicalName: 'Lanolin', description: 'Soothes cracked/sore nipples', dosage: '', minIntervalHours: 0, maxDailyDoses: 0, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
	{ name: 'Sitz bath', technicalName: 'Perineal soak', description: 'Warm soak for perineal healing', dosage: '15-20 min', minIntervalHours: 4, maxDailyDoses: 0, enabled: false, icon: '\uD83D\uDEC1', category: 'remedy' },
	{ name: 'Perineum ice pack', technicalName: 'Cold pack / padsicle', description: 'Cold therapy for swelling/pain', dosage: '20 min', minIntervalHours: 1, maxDailyDoses: 0, enabled: false, icon: '\uD83E\uDDCA', category: 'remedy' },
	{ name: 'Hemorrhoid cream', technicalName: 'Preparation H', description: 'Reduces hemorrhoid swelling and itch', dosage: '', minIntervalHours: 6, maxDailyDoses: 4, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
	{ name: 'Breast ice/heat pack', technicalName: '', description: 'Relieves engorgement and breast pain', dosage: '15-20 min', minIntervalHours: 2, maxDailyDoses: 0, enabled: false, icon: '\uD83E\uDDCA', category: 'remedy' },
	{ name: 'Peri bottle', technicalName: 'Perineal irrigation', description: 'Gentle cleansing after bathroom use', dosage: '', minIntervalHours: 0, maxDailyDoses: 0, enabled: false, icon: '\uD83D\uDEBF', category: 'remedy' },
	{ name: 'Naproxen', technicalName: 'Aleve', description: 'Anti-inflammatory pain reliever', dosage: '220mg', minIntervalHours: 8, maxDailyDoses: 3, enabled: false, icon: '\uD83D\uDC8A', category: 'medication' },
	{ name: 'Colace', technicalName: 'Docusate sodium', description: 'Stool softener for constipation', dosage: '100mg', minIntervalHours: 12, maxDailyDoses: 2, enabled: false, icon: '\uD83D\uDC8A', category: 'medication' },
	{ name: 'Miralax', technicalName: 'Polyethylene glycol', description: 'Osmotic laxative for constipation', dosage: '17g', minIntervalHours: 24, maxDailyDoses: 1, enabled: false, icon: '\uD83D\uDC8A', category: 'medication' },
];

// ── Notification Types ───────────────────────────────────────

export type NotificationType = 'in-app' | 'system' | 'both';

export interface NotificationSettings {
	enabled: boolean;
	type: NotificationType;
	/** How often to check for alerts, in minutes */
	checkIntervalMin: number;

	/** Feeding: alert when last feeding was this many hours ago */
	feedingReminderHours: number;
	feedingReminderEnabled: boolean;
	/** User override for feeding reminder hours. 0 = use age-based dynamic value. */
	feedingReminderOverride: number;

	/** Medication: alert when a dose becomes safe to take */
	medDoseReadyEnabled: boolean;
	/** Medication: alert for alternating pain med schedule */
	medAlternatingEnabled: boolean;

	/** Webhook URL for external notifications (Gotify, ntfy.sh, etc.) */
	webhookUrl: string;
	/** Whether to send webhooks */
	webhookEnabled: boolean;
	/** Webhook quick-setup preset */
	webhookPreset: 'ntfy' | 'gotify' | 'pushover' | 'custom';
	/** ntfy.sh topic name (used when preset = 'ntfy') */
	ntfyTopic: string;
	/** Schedule future ntfy notifications when logging entries (works offline). */
	scheduleNtfyOnLog: boolean;
	/** Pushover app API token */
	pushoverAppToken: string;
	/** Pushover user/group key */
	pushoverUserKey: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
	enabled: true,
	type: 'in-app',
	checkIntervalMin: 1,
	feedingReminderHours: 3,
	feedingReminderEnabled: true,
	feedingReminderOverride: 0,
	medDoseReadyEnabled: true,
	medAlternatingEnabled: true,
	webhookUrl: '',
	webhookEnabled: false,
	webhookPreset: 'ntfy',
	ntfyTopic: '',
	scheduleNtfyOnLog: true,
	pushoverAppToken: '',
	pushoverUserKey: '',
};

export interface NotificationItem {
	id: string;
	category: 'feeding' | 'medication' | 'diaper' | string;
	level: 'info' | 'warning' | 'urgent';
	title: string;
	message: string;
	firedAt: number;      // Date.now()
	snoozedUntil?: number;
}

// ── Todoist Integration ─────────────────────────────────────

export interface TodoistSettings {
	enabled: boolean;
	apiToken: string;
	projectId: string;
	projectName: string;
	/** Optional workspace/team ID — project is created under this team so all members see it */
	workspaceId: string;
	sectionIds: { feeding: string; diaper: string; medication: string; [key: string]: string };
	/** Create Todoist tasks when notification alerts fire */
	createOnAlert: boolean;
	/** Create proactive "next action" tasks after logging entries */
	createOnLog: boolean;
	/** Whether to set due dates/times on tasks. Requires Todoist Pro for reminders.
	 *  'none' = no due date, timing info in description only
	 *  'date' = due date (shows in Today view) but no specific time
	 *  'datetime' = exact due time (triggers Todoist reminder if user has Pro) */
	dueDateStyle: 'none' | 'date' | 'datetime';
	/** Approximate feeding interval hint (hours). Not a hard deadline — just an estimate
	 *  shown in the task description. Babies cluster feed, so this is flexible. */
	feedingIntervalHours: number;
	/** Priority for alert-driven tasks (1=normal, 4=urgent in Todoist) */
	alertPriority: number;
	/** Priority for proactive tasks */
	proactivePriority: number;
	/** Labels to apply to created tasks */
	labels: string[];
	/** Custom prefix for task content (e.g., emoji or tag) */
	taskPrefix: string;
	/** Suppress in-app toast notifications when Todoist is handling reminders */
	suppressToasts: boolean;
	/** Enable two-way sync: completing tasks in Todoist creates entries in plugin */
	twoWaySync: boolean;
	/** Timestamp of last successful connection */
	lastConnectedAt: number;
	/** Whether initial project setup has been completed */
	setupComplete: boolean;
}

export const DEFAULT_TODOIST_SETTINGS: TodoistSettings = {
	enabled: false,
	apiToken: '',
	projectId: '',
	projectName: 'Postpartum tasks',
	workspaceId: '',
	sectionIds: { feeding: '', diaper: '', medication: '' },
	createOnAlert: true,
	createOnLog: true,
	dueDateStyle: 'none',
	feedingIntervalHours: 3,
	alertPriority: 4,
	proactivePriority: 2,
	labels: [],
	taskPrefix: '',
	suppressToasts: true,
	twoWaySync: true,
	lastConnectedAt: 0,
	setupComplete: false,
};

// ── Tracker Events (for integrations) ───────────────────────

export interface TrackerEvent {
	type: 'feeding-logged' | 'medication-logged' | 'diaper-logged' | 'simple-logged' | 'todoist-entry-created';
	entry: FeedingEntry | MedicationEntry | DiaperEntry | SimpleTrackerEntry;
	config?: MedicationConfig;
	/** Module ID (for todoist-entry-created and simple-logged events) */
	module?: string;
}

// ── Plugin Settings ──────────────────────────────────────────

export type ButtonSize = 'compact' | 'normal' | 'large';
export type TimerAnimation = 'pulse' | 'blink' | 'glow' | 'solid';

export interface PostpartumTrackerSettings {
	timeFormat: '12h' | '24h';
	hapticFeedback: boolean;
	showButtonLabels: boolean;
	buttonSize: ButtonSize;
	buttonColumns: number;   // 0 = auto
	timerAnimation: TimerAnimation;
	/** How data entry forms are shown: modal popup or inline panel. */
	inputMode: 'modal' | 'inline';
	/** Status bar display mode. */
	statusBarMode: 'badge' | 'live' | 'off';
	/** Whether to show the daily summary stats bar at all. Default: off. */
	showSummaryBar: boolean;
	/** Where the summary bar appears in the widget layout. */
	summaryPosition: 'top' | 'bottom' | 'after-buttons';
	/** Module IDs in display order for the daily summary strip. Empty = default (all, module order). */
	summaryOrder: string[];
	/** Module IDs opted-in to appear in the daily summary bar. Empty = nothing shown. */
	visibleSummaryModules: string[];
	enableDebugLog: boolean;

	/** Which module IDs are enabled */
	enabledModules: string[];

	/** Feeding-specific */
	feeding: {
		showTimer: boolean;
		defaultType: 'breast' | 'bottle';
		trackSide: boolean;
	};

	/** Diaper-specific */
	diaper: {
		showColorPicker: boolean;
		/** @deprecated Dynamic threshold based on day-of-life is now used. Kept for data.json compat. */
		alertThreshold: number;
	};

	/** Medication-specific */
	medication: {
		medications: MedicationConfig[];
	};

	/** Notifications */
	notifications: NotificationSettings;

	/** Active logic pack IDs (can stack: e.g., one baby + one mother pack) */
	activeLogicPacks: string[];

	/** Per-library-tracker config overrides (keyed by tracker ID) */
	libraryTrackerOverrides: Record<string, LibraryTrackerOverride>;

	/** User-created custom trackers */
	customTrackers: SimpleTrackerDef[];

	/** Todoist integration */
	todoist: TodoistSettings;
}

/** User-editable overrides for a library tracker's settings. */
export interface LibraryTrackerOverride {
	/** Custom display name (empty = use default) */
	displayName?: string;
	/** Custom icon (empty = use default) */
	icon?: string;
	/** Notification override */
	notification?: {
		reminderEnabled: boolean;
		reminderIntervalHours: number;
	};
}

export const DEFAULT_SETTINGS: PostpartumTrackerSettings = {
	timeFormat: '12h',
	hapticFeedback: true,
	showButtonLabels: true,
	buttonSize: 'normal',
	buttonColumns: 0,
	timerAnimation: 'pulse',
	inputMode: 'modal',
	statusBarMode: 'live',
	showSummaryBar: false,
	summaryPosition: 'top',
	summaryOrder: [],
	visibleSummaryModules: [],
	enableDebugLog: false,
	activeLogicPacks: [],
	libraryTrackerOverrides: {},
	customTrackers: [],
	enabledModules: ['feeding', 'diaper', 'medication'],
	feeding: {
		showTimer: true,
		defaultType: 'breast',
		trackSide: true,
	},
	diaper: {
		showColorPicker: true,
		alertThreshold: 6,
	},
	medication: {
		medications: [...DEFAULT_MEDICATIONS],
	},
	notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
	todoist: { ...DEFAULT_TODOIST_SETTINGS },
};

// ── Code Block Data ──────────────────────────────────────────

/** Top-level data stored in the code block JSON. */
export interface PostpartumData {
	/** Schema version for future migrations */
	version: number;

	/** Optional metadata */
	meta: {
		babyName?: string;
		birthDate?: string;       // ISO8601 date
		birthWeight?: number;     // grams
		unitSystem?: 'metric' | 'imperial';
	};

	/** Layout order of module section IDs */
	layout: string[];

	/** Per-module entry arrays, keyed by module ID */
	trackers: {
		feeding?: FeedingEntry[];
		diaper?: DiaperEntry[];
		medication?: MedicationEntry[];
		medicationConfig?: MedicationConfig[];
		logNotes?: LogNoteEntry[];
		[key: string]: unknown;
	};

	/** Per-code-block settings overrides */
	settingsOverrides?: Partial<PostpartumTrackerSettings>;

	/** Per-code-block logic pack override (overrides global activeLogicPacks for this block) */
	logicPackId?: string;
}

export const DEFAULT_LAYOUT: string[] = ['feeding', 'diaper', 'medication'];

export const EMPTY_DATA: PostpartumData = {
	version: 1,
	meta: {},
	layout: [...DEFAULT_LAYOUT],
	trackers: {
		feeding: [],
		diaper: [],
		medication: [],
		medicationConfig: [...DEFAULT_MEDICATIONS],
		logNotes: [],
	},
};

// ── Shared UI Types ──────────────────────────────────────────

export interface QuickAction {
	id: string;
	label: string;
	icon: string;
	cls: string;
	/** Called when button is tapped. timestamp is provided when "past time" clock is active. */
	onClick: (timestamp?: string) => void;
	/** When true, label is always shown even when showButtonLabels is off (e.g., medication names). */
	labelEssential?: boolean;
}

export interface HealthAlert {
	level: 'info' | 'warning' | 'urgent';
	message: string;
	detail?: string;
}
