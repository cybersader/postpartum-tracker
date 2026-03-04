/**
 * Formatting utilities for time, duration, and display.
 */

/** Format a duration in seconds to "M:SS" (e.g., "1:23", "0:45"). */
export function formatDuration(seconds: number): string {
	if (seconds < 0) seconds = 0;
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Format a duration in seconds to "Xm Ys" or "Xs" format. */
export function formatDurationShort(seconds: number): string {
	if (seconds < 0) seconds = 0;
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	if (mins === 0) return `${secs}s`;
	if (secs === 0) return `${mins}m`;
	return `${mins}m ${secs}s`;
}

/**
 * Format a rest/elapsed timer with adaptive formatting:
 * - <60 min: M:SS
 * - 1-24h: Xh Ym
 * - 24h+: Xd Yh
 */
export function formatRestTime(seconds: number): string {
	if (seconds < 0) seconds = 0;
	const totalMinutes = Math.floor(seconds / 60);
	if (totalMinutes < 60) {
		const secs = Math.floor(seconds % 60);
		return `${totalMinutes}:${secs.toString().padStart(2, '0')}`;
	}
	if (totalMinutes < 1440) {
		const hours = Math.floor(totalMinutes / 60);
		const mins = totalMinutes % 60;
		return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
	}
	const days = Math.floor(totalMinutes / 1440);
	const hours = Math.floor((totalMinutes % 1440) / 60);
	return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

/** Format an ISO8601 timestamp to a short time string (e.g., "2:30 PM"). */
export function formatTime(iso: string, format: '12h' | '24h' = '12h'): string {
	const date = new Date(iso);
	if (format === '24h') {
		const h = date.getHours().toString().padStart(2, '0');
		const m = date.getMinutes().toString().padStart(2, '0');
		return `${h}:${m}`;
	}
	return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Format a Date to compact time (e.g., "2:30p" or "14:30"). */
export function formatTimeShort(date: Date, format: '12h' | '24h' = '12h'): string {
	if (format === '24h') {
		const h = date.getHours().toString().padStart(2, '0');
		const m = date.getMinutes().toString().padStart(2, '0');
		return `${h}:${m}`;
	}
	let h = date.getHours();
	const suffix = h >= 12 ? 'p' : 'a';
	h = h % 12 || 12;
	const m = date.getMinutes().toString().padStart(2, '0');
	return `${h}:${m}${suffix}`;
}

/** Generate a short random ID. */
export function generateId(): string {
	return Math.random().toString(36).substring(2, 8);
}
