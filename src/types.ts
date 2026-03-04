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

// ── Medication Config ────────────────────────────────────────

export type MedicationCategory = 'medication' | 'remedy';

export interface MedicationConfig {
	name: string;
	technicalName?: string;       // Generic/chemical name (e.g., 'Acetaminophen' for Tylenol)
	dosage: string;
	minIntervalHours: number;   // Minimum hours between doses
	maxDailyDoses: number;      // Max doses per 24h (0 = unlimited)
	enabled: boolean;
	icon: string;               // Emoji or character
	category?: MedicationCategory; // 'medication' (default) or 'remedy' (topical/external)
}

export const DEFAULT_MEDICATIONS: MedicationConfig[] = [
	// Pain medications
	{ name: 'Tylenol', technicalName: 'Acetaminophen', dosage: '500mg', minIntervalHours: 6, maxDailyDoses: 4, enabled: true, icon: '\uD83D\uDC8A', category: 'medication' },
	{ name: 'Ibuprofen', technicalName: 'Ibuprofen', dosage: '200mg', minIntervalHours: 6, maxDailyDoses: 4, enabled: true, icon: '\uD83D\uDC8A', category: 'medication' },
	{ name: 'Norco', technicalName: 'Hydrocodone/Acetaminophen', dosage: '5/325mg', minIntervalHours: 4, maxDailyDoses: 6, enabled: false, icon: '\uD83D\uDC8A', category: 'medication' },
	// Supplements
	{ name: 'Stool softener', technicalName: 'Docusate sodium', dosage: '100mg', minIntervalHours: 24, maxDailyDoses: 2, enabled: false, icon: '\uD83D\uDC8A', category: 'medication' },
	{ name: 'Prenatal vitamin', technicalName: '', dosage: '', minIntervalHours: 24, maxDailyDoses: 1, enabled: false, icon: '\uD83D\uDC8A', category: 'medication' },
	{ name: 'Iron supplement', technicalName: 'Ferrous sulfate', dosage: '', minIntervalHours: 24, maxDailyDoses: 1, enabled: false, icon: '\uD83D\uDC8A', category: 'medication' },
	// Topical remedies / perineal care
	{ name: 'Dermoplast', technicalName: 'Benzocaine/Menthol spray', dosage: '', minIntervalHours: 4, maxDailyDoses: 0, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
	{ name: 'Lidocaine cream', technicalName: 'Lidocaine topical', dosage: '', minIntervalHours: 4, maxDailyDoses: 0, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
	{ name: 'EMLA cream', technicalName: 'Lidocaine/Prilocaine', dosage: '', minIntervalHours: 4, maxDailyDoses: 0, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
	{ name: 'Proctofoam', technicalName: 'Pramoxine/Hydrocortisone', dosage: '', minIntervalHours: 6, maxDailyDoses: 4, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
	{ name: 'Witch hazel pads', technicalName: 'Tucks pads', dosage: '', minIntervalHours: 0, maxDailyDoses: 0, enabled: false, icon: '\uD83E\uDDF4', category: 'remedy' },
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

	/** Medication: alert when a dose becomes safe to take */
	medDoseReadyEnabled: boolean;
	/** Medication: alert for alternating pain med schedule */
	medAlternatingEnabled: boolean;

	/** Webhook URL for external notifications (Gotify, ntfy.sh, etc.) */
	webhookUrl: string;
	/** Whether to send webhooks */
	webhookEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
	enabled: true,
	type: 'in-app',
	checkIntervalMin: 1,
	feedingReminderHours: 3,
	feedingReminderEnabled: true,
	medDoseReadyEnabled: true,
	medAlternatingEnabled: true,
	webhookUrl: '',
	webhookEnabled: false,
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

export interface PostpartumTrackerSettings {
	timeFormat: '12h' | '24h';
	hapticFeedback: boolean;
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
		/** Min wet diapers per day before warning */
		alertThreshold: number;
	};

	/** Medication-specific */
	medication: {
		medications: MedicationConfig[];
	};

	/** Notifications */
	notifications: NotificationSettings;

	/** Todoist integration */
	todoist: TodoistSettings;
}

export const DEFAULT_SETTINGS: PostpartumTrackerSettings = {
	timeFormat: '12h',
	hapticFeedback: true,
	enableDebugLog: false,
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
}

export interface HealthAlert {
	level: 'info' | 'warning' | 'urgent';
	message: string;
	detail?: string;
}
