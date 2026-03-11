/**
 * Sleep analytics with charts and insights.
 * Shows total sleep, nap counts, awake windows, and timeline.
 */
import type { PostpartumTrackerSettings } from '../../types';
import { dateKeys, toDateKey, dayLabels, trendDirection, TREND_ARROWS } from '../charts/SvgChart';
import { renderBarChart, type BarDatum } from '../charts/BarChart';
import { renderTimelineChart, type TimelineRow } from '../charts/TimelineChart';
import { renderSparkLine } from '../charts/SparkLine';

interface SleepEntry {
	id: string;
	timestamp: string;
	end?: string | null;
	durationSec?: number;
	fields?: Record<string, unknown>;
	notes?: string;
}

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

		// ── Total sleep hours per day ──
		const sleepHoursData: BarDatum[] = keys.map((k, i) => {
			const total = byDay.get(k)!.reduce((sum, e) => sum + getDurHours(e), 0);
			return { label: labels[i], value: Math.round(total * 10) / 10 };
		});
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Sleep hours per day' });
		const hoursContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderBarChart(hoursContainer, sleepHoursData, {
			movingAvgWindow: 3,
			color: 'var(--color-purple)',
		});

		// ── Nap count per day ──
		const napData: BarDatum[] = keys.map((k, i) => ({
			label: labels[i],
			value: byDay.get(k)!.filter(e => e.end != null).length,
		}));
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Sleep sessions per day' });
		const napContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderBarChart(napContainer, napData, { color: 'var(--color-purple)' });

		// ── Sleep timeline (last 3 days) ──
		const timelineDays = Math.min(3, days);
		const recentKeys = keys.slice(-timelineDays);
		const recentLabels = labels.slice(-timelineDays);
		const rows: TimelineRow[] = recentKeys.map((k, i) => ({
			dayLabel: recentLabels[i],
			blocks: byDay.get(k)!.filter(e => e.end != null).map(e => ({
				startHour: toDecimalHour(e.timestamp),
				endHour: toDecimalHour(e.end!),
				color: 'var(--color-purple)',
			})),
		}));
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Sleep times' });
		const tlContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderTimelineChart(tlContainer, rows);

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

		// Trend
		const dailyHours = sleepHoursData.map(d => d.value);
		const trend = trendDirection(dailyHours);
		addInsight(insightsEl, `Sleep trend: ${TREND_ARROWS[trend]}`, trend);

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

	getEl(): HTMLElement { return this.el; }
}

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
