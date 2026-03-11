/**
 * Sleep analytics with charts and insights.
 * Shows total sleep, nap counts, awake windows, period ranking,
 * parent sleep window overlay, and timeline.
 */
import type { PostpartumTrackerSettings } from '../../types';
import { dateKeys, toDateKey, dayLabels, trendDirection, TREND_ARROWS, aggregateWeekly, collapseToWeeks } from '../charts/SvgChart';
import { renderBarChart, type BarDatum } from '../charts/BarChart';
import { renderTimelineChart, type TimelineRow, type TimelineChartOptions } from '../charts/TimelineChart';
import { renderSparkLine } from '../charts/SparkLine';
import { renderHeatmapChart } from '../charts/HeatmapChart';
import { renderActivityProfile } from '../charts/ActivityProfile';

interface SleepEntry {
	id: string;
	timestamp: string;
	end?: string | null;
	durationSec?: number;
	fields?: Record<string, unknown>;
	notes?: string;
}

/** 6-hour period definition. */
const PERIODS = [
	{ label: 'Night (12a\u20136a)', start: 0, end: 6 },
	{ label: 'Morning (6a\u201312p)', start: 6, end: 12 },
	{ label: 'Afternoon (12p\u20136p)', start: 12, end: 18 },
	{ label: 'Evening (6p\u201312a)', start: 18, end: 24 },
] as const;

export class SleepAnalytics {
	private el: HTMLElement;

	constructor(parent: HTMLElement) {
		this.el = parent.createDiv({ cls: 'pt-analytics pt-sleep-analytics' });
	}

	render(entries: SleepEntry[], settings: PostpartumTrackerSettings, windowDays: number): void {
		this.el.empty();
		const days = windowDays;
		const keys = dateKeys(days);
		const labels = dayLabels(days);

		const byDay = new Map<string, SleepEntry[]>();
		for (const k of keys) byDay.set(k, []);
		for (const e of entries) {
			const k = toDateKey(e.timestamp);
			if (byDay.has(k)) byDay.get(k)!.push(e);
		}

		// Daily values (used by bars and heatmap)
		const dailyHoursRaw = keys.map(k =>
			byDay.get(k)!.reduce((sum, e) => sum + getDurHours(e), 0));
		const dailySessionsRaw = keys.map(k =>
			byDay.get(k)!.filter(e => e.end != null).length);
		const useWeeklyBars = days >= 60;
		const isWeekly = days >= 30;

		// ── Sleep hours ──
		if (useWeeklyBars) {
			const agg = aggregateWeekly(dailyHoursRaw, labels);
			const barData: BarDatum[] = agg.values.map((v, i) => ({ label: agg.labels[i], value: v }));
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Sleep hours (weekly avg)' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderBarChart(c, barData, { color: 'var(--color-purple)' });
		} else {
			const barData: BarDatum[] = dailyHoursRaw.map((v, i) => ({
				label: labels[i], value: Math.round(v * 10) / 10,
			}));
			const title = isWeekly ? 'Sleep hours per day (7-day avg)' : 'Sleep hours per day';
			this.el.createDiv({ cls: 'pt-analytics-title', text: title });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderBarChart(c, barData, {
				movingAvgWindow: isWeekly ? 7 : 3,
				showValues: !isWeekly,
				color: 'var(--color-purple)',
			});
		}

		// ── Sleep sessions ──
		if (useWeeklyBars) {
			const agg = aggregateWeekly(dailySessionsRaw, labels);
			const barData: BarDatum[] = agg.values.map((v, i) => ({ label: agg.labels[i], value: v }));
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Sleep sessions (weekly avg)' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderBarChart(c, barData, { color: 'var(--color-purple)' });
		} else {
			const barData: BarDatum[] = dailySessionsRaw.map((v, i) => ({
				label: labels[i], value: v,
			}));
			const title = isWeekly ? 'Sleep sessions per day (7-day avg)' : 'Sleep sessions per day';
			this.el.createDiv({ cls: 'pt-analytics-title', text: title });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderBarChart(c, barData, {
				movingAvgWindow: isWeekly ? 7 : 0,
				showValues: !isWeekly,
				color: 'var(--color-purple)',
			});
		}

		// ── Sleep by time of day (period ranking — averages) ──
		this.renderPeriodRanking(entries, keys, byDay, days);

		// ── Sleep heatmap (hour × day or weekday average) ──
		const dailyHeatGrid = this.buildHourGrid(keys, byDay);
		const fmtSleepHours = (h: number) => {
			const hrs = Math.floor(h);
			const min = Math.round((h - hrs) * 60);
			return hrs > 0 ? `${hrs}h${min}m/day` : `${min}m/day`;
		};
		const fmtSleepCell = (v: number) => v === 0 ? 'Awake' : 'Asleep';
		if (isWeekly) {
			const { grid: wkGrid, labels: wkLabels } = collapseToWeeks(dailyHeatGrid);
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Sleep by week' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderHeatmapChart(c, wkGrid, wkLabels, {
				color: 'var(--color-purple)', showAvgRow: true,
				formatValue: fmtSleepCell, formatRowTotal: fmtSleepHours,
			});
		} else {
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Sleep activity by hour' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderHeatmapChart(c, dailyHeatGrid, labels, {
				color: 'var(--color-purple)',
				formatValue: fmtSleepCell, formatRowTotal: fmtSleepHours,
			});
		}

		// ── Average sleep profile ──
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Average sleep by hour' });
		const profileContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderActivityProfile(profileContainer, dailyHeatGrid, {
			color: 'var(--color-purple)',
			peakLabel: 'most sleep',
		});

		// ── Sleep timeline (last 3 days) ──
		const parentEnabled = settings.sleep?.parentWindowEnabled ?? false;
		const bed = settings.sleep?.parentBedtimeHour ?? 22;
		const wake = settings.sleep?.parentWakeHour ?? 6;

		const timelineDays = Math.min(3, days);
		const recentKeys = keys.slice(-timelineDays);
		const recentLabels = labels.slice(-timelineDays);
		const rows: TimelineRow[] = recentKeys.map((k, i) => ({
			dayLabel: recentLabels[i],
			blocks: byDay.get(k)!.filter(e => e.end != null).map(e => {
				const startH = toDecimalHour(e.timestamp);
				const endH = toDecimalHour(e.end!);
				const color = parentEnabled && overlapsParentWindow(startH, endH, bed, wake)
					? 'var(--color-green)'
					: 'var(--color-purple)';
				return { startHour: startH, endHour: endH, color };
			}),
		}));

		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Sleep times' });
		const tlContainer = this.el.createDiv({ cls: 'pt-chart-container' });

		const tlOpts: TimelineChartOptions = {};
		if (parentEnabled) {
			tlOpts.backgroundBands = [{
				startHour: bed,
				endHour: wake,
				color: 'var(--color-green)',
				opacity: 0.08,
			}];
		}
		renderTimelineChart(tlContainer, rows, tlOpts);

		// Legend when parent window enabled
		if (parentEnabled) {
			const legend = this.el.createDiv({ cls: 'pt-timeline-legend' });
			const addLegendItem = (color: string, text: string) => {
				const item = legend.createDiv({ cls: 'pt-timeline-legend-item' });
				const swatch = item.createSpan({ cls: 'pt-timeline-legend-swatch' });
				swatch.style.background = color;
				item.createSpan({ text });
			};
			addLegendItem('var(--color-green)', 'During parent sleep');
			addLegendItem('var(--color-purple)', 'Outside parent sleep');
		}

		// ── Insights ──
		const insightsEl = this.el.createDiv({ cls: 'pt-insights' });

		// Total sleep today
		const todayKey = keys[keys.length - 1];
		const todayTotal = byDay.get(todayKey)!.reduce((sum, e) => sum + getDurHours(e), 0);
		const h = Math.floor(todayTotal);
		const m = Math.round((todayTotal - h) * 60);
		addInsight(insightsEl, `${h}h ${m}m total sleep today`, 'neutral');

		// Longest stretch
		const todayDurs = byDay.get(todayKey)!.map(getDurHours).filter(d => d > 0);
		if (todayDurs.length > 0) {
			const longest = Math.max(...todayDurs);
			const lh = Math.floor(longest);
			const lm = Math.round((longest - lh) * 60);
			addInsight(insightsEl, `Longest stretch: ${lh}h ${lm}m`, 'neutral');
		}

		// Average awake window
		const todayEntries = byDay.get(todayKey)!
			.filter(e => e.end != null)
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		if (todayEntries.length >= 2) {
			let totalGap = 0;
			let gapCount = 0;
			for (let i = 1; i < todayEntries.length; i++) {
				const gap = new Date(todayEntries[i].timestamp).getTime() - new Date(todayEntries[i - 1].end!).getTime();
				if (gap > 0) { totalGap += gap; gapCount++; }
			}
			if (gapCount > 0) {
				const avgGapH = totalGap / gapCount / 3600000;
				const gh = Math.floor(avgGapH);
				const gm = Math.round((avgGapH - gh) * 60);
				addInsight(insightsEl, `Avg awake window: ${gh}h ${gm}m`, 'neutral');
			}
		}

		// Trend (only use days with data for trend)
		const dailyHours = dailyHoursRaw;
		const trend = trendDirection(dailyHours);
		addInsight(insightsEl, `Sleep trend: ${TREND_ARROWS[trend]}`, trend);

		// Active days notice
		const activeDays = keys.filter(k => byDay.get(k)!.some(e => e.end != null)).length;
		if (activeDays < days && activeDays > 0) {
			addInsight(insightsEl, `Data from ${activeDays} of ${days} days (averages adjusted)`, 'neutral');
		}

		// Parent sleep coverage
		if (parentEnabled) {
			const coverage = computeParentCoverage(todayEntries, bed, wake);
			const coverType = coverage >= 70 ? 'up' : coverage >= 40 ? 'neutral' : 'down';
			addInsight(insightsEl, `Baby slept ${Math.round(coverage)}% of your sleep window`, coverType);
		}

		// Age-appropriate context
		const birthDate = (settings as any).birthDate;
		if (!birthDate) {
			addInsight(insightsEl, 'Newborns: 14-17h/day typical', 'neutral');
		}

		// Sparkline
		if (days >= 3) {
			insightsEl.createDiv({ cls: 'pt-analytics-mini-title', text: 'Longest stretch trend' });
			const longestByDay = keys.map(k => {
				const durs = byDay.get(k)!.map(getDurHours).filter(d => d > 0);
				return durs.length > 0 ? Math.max(...durs) : 0;
			});
			const sparkEl = insightsEl.createDiv({ cls: 'pt-sparkline-container' });
			renderSparkLine(sparkEl, longestByDay, { color: 'var(--color-purple)' });
		}
	}

	/** Render horizontal bar ranking of average sleep hours per day by 6-hour period. */
	private renderPeriodRanking(
		entries: SleepEntry[],
		keys: string[],
		byDay: Map<string, SleepEntry[]>,
		numDays: number,
	): void {
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Sleep by time of day' });

		// Collect all entries in the window
		const allEntries: SleepEntry[] = [];
		for (const k of keys) allEntries.push(...byDay.get(k)!.filter(e => e.end != null));

		if (allEntries.length === 0) {
			this.el.createDiv({ cls: 'pt-insight pt-insight--neutral', text: 'No sleep data' });
			return;
		}

		// Count days that actually have sleep data (ignore empty/missed logging days)
		const activeDays = keys.filter(k => byDay.get(k)!.some(e => e.end != null)).length;
		const divisor = Math.max(activeDays, 1);

		// Accumulate hours per period
		const periodHours: number[] = [0, 0, 0, 0]; // Night, Morning, Afternoon, Evening
		for (const e of allEntries) {
			const startH = toDecimalHour(e.timestamp);
			const endH = toDecimalHour(e.end!);
			distributeToPeriods(startH, endH, getDurHours(e), periodHours);
		}

		// Build ranked list by daily average (descending)
		const ranked = PERIODS.map((p, i) => ({
			label: p.label,
			avgHours: periodHours[i] / divisor,
		})).sort((a, b) => b.avgHours - a.avgHours);

		const maxH = ranked[0].avgHours || 1;
		const container = this.el.createDiv({ cls: 'pt-period-rank' });
		for (const item of ranked) {
			const row = container.createDiv({ cls: 'pt-period-rank-row' });
			row.createSpan({ cls: 'pt-period-rank-label', text: item.label });
			const bar = row.createDiv({ cls: 'pt-period-rank-bar' });
			bar.style.width = `${Math.max((item.avgHours / maxH) * 100, 2)}%`;
			const h = Math.floor(item.avgHours);
			const m = Math.round((item.avgHours - h) * 60);
			const timeStr = h > 0 ? `${h}h ${m}m avg` : `${m}m avg`;
			row.createSpan({ cls: 'pt-period-rank-value', text: timeStr });
		}
	}

	/** Build a grid[day][hour] of fractional sleep hours for the heatmap. */
	private buildHourGrid(keys: string[], byDay: Map<string, SleepEntry[]>): number[][] {
		const grid: number[][] = [];
		for (const k of keys) {
			const hourBuckets = new Array<number>(24).fill(0);
			for (const e of byDay.get(k)!.filter(e => e.end != null)) {
				const startH = toDecimalHour(e.timestamp);
				const endH = toDecimalHour(e.end!);
				const totalH = getDurHours(e);
				if (totalH <= 0) continue;
				distributeToHours(startH, endH, totalH, hourBuckets);
			}
			grid.push(hourBuckets);
		}
		return grid;
	}

	getEl(): HTMLElement { return this.el; }
}

// ── Helpers ──

function getDurHours(e: SleepEntry): number {
	if (e.durationSec != null) return e.durationSec / 3600;
	if (!e.end) return 0;
	return Math.max(0, (new Date(e.end).getTime() - new Date(e.timestamp).getTime()) / 3600000);
}

function toDecimalHour(iso: string): number {
	const d = new Date(iso);
	return d.getHours() + d.getMinutes() / 60;
}

function addInsight(parent: HTMLElement, text: string, type: string): void {
	parent.createDiv({ cls: `pt-insight pt-insight--${type}`, text });
}

/**
 * Distribute a sleep entry's hours across the 4 time-of-day periods.
 * Handles entries that span period boundaries (e.g. 5:30am-7am crosses Night→Morning).
 */
function distributeToPeriods(startH: number, endH: number, totalHours: number, out: number[]): void {
	if (totalHours <= 0) return;

	// Handle same-hour entries or entries that don't cross midnight within the day
	// We use actual hour positions to proportionally distribute
	let effectiveEnd = endH;
	if (endH <= startH) {
		// Entry crosses midnight — for period distribution, treat as spanning to 24
		// then from 0 to endH (split into two calls)
		if (startH < 24) {
			const firstPart = (24 - startH) / ((24 - startH) + endH) * totalHours;
			distributeSingleSpan(startH, 24, firstPart, out);
		}
		if (endH > 0) {
			const secondPart = endH / ((24 - startH) + endH) * totalHours;
			distributeSingleSpan(0, endH, secondPart, out);
		}
		return;
	}
	distributeSingleSpan(startH, effectiveEnd, totalHours, out);
}

/** Distribute hours for a span that does NOT cross midnight. */
function distributeSingleSpan(startH: number, endH: number, totalHours: number, out: number[]): void {
	const spanLen = endH - startH;
	if (spanLen <= 0) return;

	for (let i = 0; i < PERIODS.length; i++) {
		const p = PERIODS[i];
		const overlapStart = Math.max(startH, p.start);
		const overlapEnd = Math.min(endH, p.end);
		if (overlapEnd > overlapStart) {
			out[i] += (overlapEnd - overlapStart) / spanLen * totalHours;
		}
	}
}

/** Check if a sleep block overlaps the parent sleep window. */
function overlapsParentWindow(startH: number, endH: number, bed: number, wake: number): boolean {
	if (bed > wake) {
		// Overnight window (e.g. 22-6): overlaps if touches [bed,24) or [0,wake]
		return startH >= bed || endH <= wake || startH < wake ||
			(endH <= startH && (startH >= bed || endH <= wake));
	}
	// Daytime window (unusual but supported)
	if (endH > startH) {
		return startH < wake && endH > bed;
	}
	// Sleep crosses midnight, window is daytime — always some overlap possible
	return true;
}

/**
 * Compute what % of the parent's target sleep window the baby was also sleeping.
 * Uses interval union to avoid double-counting overlapping entries.
 */
function computeParentCoverage(entries: SleepEntry[], bed: number, wake: number): number {
	// Parent window duration in hours
	const windowHours = bed > wake ? (24 - bed) + wake : wake - bed;
	if (windowHours <= 0) return 0;

	// Clip each entry to the parent window, collecting overlap intervals in minutes
	const intervals: [number, number][] = [];

	for (const e of entries) {
		if (!e.end) continue;
		const startH = toDecimalHour(e.timestamp);
		const endH = toDecimalHour(e.end);
		const clipped = clipToWindow(startH, endH, bed, wake);
		intervals.push(...clipped);
	}

	if (intervals.length === 0) return 0;

	// Union overlapping intervals (in hour units relative to window start)
	intervals.sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [intervals[0]];
	for (let i = 1; i < intervals.length; i++) {
		const last = merged[merged.length - 1];
		if (intervals[i][0] <= last[1]) {
			last[1] = Math.max(last[1], intervals[i][1]);
		} else {
			merged.push(intervals[i]);
		}
	}

	const coveredHours = merged.reduce((sum, [a, b]) => sum + (b - a), 0);
	return Math.min(100, (coveredHours / windowHours) * 100);
}

/**
 * Clip a sleep interval to the parent window, returning 0-2 intervals
 * in "hours from window start" coordinates.
 */
function clipToWindow(startH: number, endH: number, bed: number, wake: number): [number, number][] {
	const result: [number, number][] = [];

	if (bed > wake) {
		// Overnight window: [bed,24) + [0,wake]
		// Segment 1: [bed, 24)
		const seg1 = clipOverlap(startH, endH, bed, 24);
		if (seg1) result.push([seg1[0] - bed, seg1[1] - bed]);
		// Segment 2: [0, wake]
		const seg2 = clipOverlap(startH, endH, 0, wake);
		if (seg2) result.push([seg2[0] + (24 - bed), seg2[1] + (24 - bed)]);

		// If sleep crosses midnight, also check the wrapped portion
		if (endH < startH) {
			// Sleep from startH→24 and 0→endH
			const seg1b = clipOverlap(0, endH, bed, 24);
			if (seg1b) result.push([seg1b[0] - bed, seg1b[1] - bed]);
			const seg2b = clipOverlap(0, endH, 0, wake);
			if (seg2b) result.push([seg2b[0] + (24 - bed), seg2b[1] + (24 - bed)]);
		}
	} else {
		// Daytime window
		const seg = clipOverlap(startH, endH, bed, wake);
		if (seg) result.push([seg[0] - bed, seg[1] - bed]);
		if (endH < startH) {
			const segb = clipOverlap(0, endH, bed, wake);
			if (segb) result.push([segb[0] - bed, segb[1] - bed]);
		}
	}

	return result;
}

/** Return the overlap of [s1,e1] and [s2,e2], or null if none. */
function clipOverlap(s1: number, e1: number, s2: number, e2: number): [number, number] | null {
	// For non-wrapping intervals only
	if (e1 <= s1) return null; // degenerate
	const start = Math.max(s1, s2);
	const end = Math.min(e1, e2);
	return end > start ? [start, end] : null;
}

/** Distribute sleep hours into 24 hour-buckets for the heatmap. */
function distributeToHours(startH: number, endH: number, totalHours: number, out: number[]): void {
	if (totalHours <= 0) return;
	if (endH <= startH) {
		// Crosses midnight
		const span = (24 - startH) + endH;
		if (span <= 0) return;
		distributeHourSpan(startH, 24, (24 - startH) / span * totalHours, out);
		distributeHourSpan(0, endH, endH / span * totalHours, out);
	} else {
		distributeHourSpan(startH, endH, totalHours, out);
	}
}

function distributeHourSpan(startH: number, endH: number, totalHours: number, out: number[]): void {
	const span = endH - startH;
	if (span <= 0) return;
	const firstHour = Math.floor(startH);
	const lastHour = Math.min(Math.floor(endH - 0.001), 23);
	for (let h = firstHour; h <= lastHour && h < 24; h++) {
		const bucketStart = Math.max(startH, h);
		const bucketEnd = Math.min(endH, h + 1);
		out[h] += (bucketEnd - bucketStart) / span * totalHours;
	}
}
