import type { PostpartumTrackerSettings, QuickAction, HealthAlert, TrackerEvent } from '../types';

/**
 * Every tracker module must implement this interface.
 * The TrackerWidget calls these methods in a standardized lifecycle.
 */
export interface TrackerModule<TEntry = unknown, TStats = unknown> {
	/** Unique identifier used as key in the JSON data (e.g., 'feeding', 'diaper') */
	readonly id: string;

	/** Display name shown in the collapsible section header */
	readonly displayName: string;

	/** Default expanded state for the collapsible section */
	readonly defaultExpanded: boolean;

	/** Order weight for default layout (lower = higher) */
	readonly defaultOrder: number;

	/**
	 * Parse this module's entries from the raw data.
	 * Must handle missing/malformed data gracefully, returning [].
	 */
	parseEntries(raw: unknown): TEntry[];

	/**
	 * Serialize this module's current entries for JSON.stringify().
	 */
	serializeEntries(): unknown;

	/**
	 * Return the default (empty) entries for a new code block.
	 */
	emptyEntries(): TEntry[];

	/**
	 * Build the UI for this module's collapsible section body.
	 * Receives the container element and a save callback.
	 */
	buildUI(
		bodyEl: HTMLElement,
		save: () => Promise<void>,
		settings: PostpartumTrackerSettings,
		emitEvent?: (event: TrackerEvent) => void
	): void;

	/**
	 * Update the module with new data.
	 * Called after every save (re-render cycle).
	 */
	update(entries: TEntry[]): void;

	/**
	 * Compute summary statistics for the daily dashboard.
	 */
	computeStats(entries: TEntry[], dayStart: Date, dayEnd: Date): TStats;

	/**
	 * Render summary stats into the daily dashboard area.
	 */
	renderSummary(el: HTMLElement, stats: TStats): void;

	/**
	 * Return quick-action button definitions for the top-level area.
	 */
	getQuickActions(): QuickAction[];

	/**
	 * Called every 200ms for modules that need live updates (e.g., feeding timer).
	 */
	tick?(): void;

	/**
	 * Return any health alerts/flags for the current data.
	 */
	getAlerts?(entries: TEntry[], dayStart: Date, birthDate?: string): HealthAlert[];

	/**
	 * Clean up any resources (timers, event listeners).
	 */
	destroy?(): void;
}
