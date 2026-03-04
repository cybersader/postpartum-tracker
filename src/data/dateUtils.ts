/**
 * Date/time utilities for day boundary calculations.
 * All calculations use local timezone.
 */

/** Get the start of today (local midnight). */
export function getDayStart(date: Date = new Date()): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

/** Get the end of today (23:59:59.999 local). */
export function getDayEnd(date: Date = new Date()): Date {
	const d = new Date(date);
	d.setHours(23, 59, 59, 999);
	return d;
}

/** Check if a timestamp (ISO8601 string) falls within a given day. */
export function isOnDay(iso: string, day: Date = new Date()): boolean {
	const ts = new Date(iso);
	const start = getDayStart(day);
	const end = getDayEnd(day);
	return ts >= start && ts <= end;
}

/** Filter items by a timestamp field to those on a given day. */
export function filterToday<T>(
	items: T[],
	getTimestamp: (item: T) => string,
	day: Date = new Date()
): T[] {
	const start = getDayStart(day);
	const end = getDayEnd(day);
	return items.filter(item => {
		const ts = new Date(getTimestamp(item));
		return ts >= start && ts <= end;
	});
}

/**
 * Calculate days since a date (inclusive of the birth day as day 0).
 * Returns -1 if birthDate is in the future.
 */
export function daysSinceBirth(birthDateIso: string): number {
	const birth = getDayStart(new Date(birthDateIso));
	const today = getDayStart();
	const diff = today.getTime() - birth.getTime();
	if (diff < 0) return -1;
	return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** Format "X ago" from an ISO timestamp. */
export function timeAgo(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	if (diff < 0) return 'just now';
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	const remainMins = minutes % 60;
	if (hours < 24) {
		return remainMins === 0 ? `${hours}h ago` : `${hours}h ${remainMins}m ago`;
	}
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
