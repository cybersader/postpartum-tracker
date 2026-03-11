/**
 * Feeding analytics section with charts and insights.
 * Shows trends, time-of-day patterns, and L/R balance.
 */
import type { FeedingEntry, PostpartumTrackerSettings } from '../../types';
import { dateKeys, toDateKey, dayLabels, trendDirection, TREND_ARROWS } from '../charts/SvgChart';
import { renderBarChart, type BarDatum } from '../charts/BarChart';
import { renderTimelineChart, type TimelineRow } from '../charts/TimelineChart';
import { renderSparkLine } from '../charts/SparkLine';

export class FeedingAnalytics {
	private el: HTMLElement;

	constructor(parent: HTMLElement) {
		this.el = parent.createDiv({ cls: 'pt-analytics pt-feeding-analytics' });
	}

	render(entries: FeedingEntry[], settings: PostpartumTrackerSettings, windowDays: number): void {
		this.el.empty();
		const days = windowDays;
		const keys = dateKeys(days);
		const labels = dayLabels(days);

		// Group entries by date
		const byDay = new Map<string, FeedingEntry[]>();
		for (const k of keys) byDay.set(k, []);
		for (const e of entries) {
			const k = toDateKey(e.start);
			if (byDay.has(k)) byDay.get(k)!.push(e);
		}

		// ── Feedings per day (bar chart with moving avg) ──
		const countData: BarDatum[] = keys.map((k, i) => ({
			label: labels[i],
			value: byDay.get(k)!.filter(e => e.end !== null).length,
		}));
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Feedings per day' });
		const countContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderBarChart(countContainer, countData, { movingAvgWindow: 3 });

		// ── Nursing minutes per day (stacked L/R) ──
		const durationData: BarDatum[] = keys.map((k, i) => {
			const dayEntries = byDay.get(k)!.filter(e => e.end !== null && e.type !== 'bottle');
			let leftMin = 0, rightMin = 0, bothMin = 0;
			for (const e of dayEntries) {
				const dur = getDurMin(e);
				if (e.side === 'left') leftMin += dur;
				else if (e.side === 'right') rightMin += dur;
				else bothMin += dur;
			}
			return {
				label: labels[i],
				value: 0,
				segments: [
					{ value: Math.round(leftMin), color: 'var(--color-blue)' },
					{ value: Math.round(rightMin), color: 'var(--color-orange)' },
					{ value: Math.round(bothMin), color: 'var(--color-green)' },
				],
			};
		});
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Nursing minutes (L/R/Both)' });
		const durContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderBarChart(durContainer, durationData);

		// ── Time-of-day timeline (last 3 days) ──
		const timelineDays = Math.min(3, days);
		const recentKeys = keys.slice(-timelineDays);
		const recentLabels = labels.slice(-timelineDays);
		const rows: TimelineRow[] = recentKeys.map((k, i) => ({
			dayLabel: recentLabels[i],
			blocks: byDay.get(k)!.filter(e => e.end !== null).map(e => {
				const start = toDecimalHour(e.start);
				const end = toDecimalHour(e.end!);
				const color = e.side === 'left' ? 'var(--color-blue)'
					: e.side === 'right' ? 'var(--color-orange)' : 'var(--color-green)';
				return { startHour: start, endHour: end, color };
			}),
		}));
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Feeding times' });
		const tlContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderTimelineChart(tlContainer, rows);

		// ── L/R Balance bar ──
		const allCompleted = entries.filter(e => e.end !== null && e.type !== 'bottle');
		const recentCompleted = allCompleted.filter(e => {
			const k = toDateKey(e.start);
			return keys.includes(k);
		});
		let totalL = 0, totalR = 0;
		for (const e of recentCompleted) {
			const dur = getDurMin(e);
			if (e.side === 'left') totalL += dur;
			else if (e.side === 'right') totalR += dur;
			else { totalL += dur / 2; totalR += dur / 2; }
		}
		const total = totalL + totalR || 1;
		const lPct = Math.round((totalL / total) * 100);
		const rPct = 100 - lPct;

		const balanceEl = this.el.createDiv({ cls: 'pt-balance-section' });
		balanceEl.createDiv({ cls: 'pt-analytics-title', text: 'L/R balance' });
		const barEl = balanceEl.createDiv({ cls: 'pt-balance-bar' });
		const leftBar = barEl.createDiv({ cls: 'pt-balance-left' });
		leftBar.style.width = `${lPct}%`;
		leftBar.textContent = `L ${lPct}%`;
		const rightBar = barEl.createDiv({ cls: 'pt-balance-right' });
		rightBar.style.width = `${rPct}%`;
		rightBar.textContent = `R ${rPct}%`;

		// ── Insights ──
		const insightsEl = this.el.createDiv({ cls: 'pt-insights' });
		const dailyCounts = countData.map(d => d.value);
		const nonZero = dailyCounts.filter(v => v > 0);
		const avgFeedings = nonZero.length > 0
			? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length * 10) / 10
			: 0;
		const trend = trendDirection(dailyCounts);
		addInsight(insightsEl, `${avgFeedings} feedings/day avg ${TREND_ARROWS[trend]}`, trend);

		// Average session duration
		const allDurs = recentCompleted.map(getDurMin).filter(d => d > 0);
		if (allDurs.length > 0) {
			const avgDur = Math.round(allDurs.reduce((a, b) => a + b, 0) / allDurs.length);
			addInsight(insightsEl, `Average session: ${avgDur}m`, 'neutral');
		}

		// Longest gap today
		const todayKey = keys[keys.length - 1];
		const todayEntries = byDay.get(todayKey)!
			.filter(e => e.end !== null)
			.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
		if (todayEntries.length >= 2) {
			let maxGap = 0;
			for (let i = 1; i < todayEntries.length; i++) {
				const gap = new Date(todayEntries[i].start).getTime() - new Date(todayEntries[i - 1].end!).getTime();
				maxGap = Math.max(maxGap, gap);
			}
			const gapH = Math.floor(maxGap / 3600000);
			const gapM = Math.round((maxGap % 3600000) / 60000);
			addInsight(insightsEl, `Longest gap today: ${gapH}h ${gapM}m`, 'neutral');
		}

		// Next side suggestion
		const lastFeeding = allCompleted[allCompleted.length - 1];
		if (lastFeeding) {
			const nextSide = lastFeeding.side === 'left' ? 'Right' : 'Left';
			addInsight(insightsEl, `Next side: ${nextSide}`, 'neutral');
		}

		// Sparkline for avg duration trend
		if (days >= 3) {
			const durByDay = keys.map(k => {
				const d = byDay.get(k)!.filter(e => e.end !== null && e.type !== 'bottle');
				const durs = d.map(getDurMin);
				return durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
			});
			insightsEl.createDiv({ cls: 'pt-analytics-mini-title', text: 'Avg session trend' });
			const sparkEl = insightsEl.createDiv({ cls: 'pt-sparkline-container' });
			renderSparkLine(sparkEl, durByDay);
		}
	}

	getEl(): HTMLElement { return this.el; }
}

function getDurMin(e: FeedingEntry): number {
	if (e.durationSec != null) return e.durationSec / 60;
	if (!e.end) return 0;
	return Math.max(0, (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000);
}

function toDecimalHour(iso: string): number {
	const d = new Date(iso);
	return d.getHours() + d.getMinutes() / 60;
}

function addInsight(parent: HTMLElement, text: string, type: string): void {
	parent.createDiv({ cls: `pt-insight pt-insight--${type}`, text });
}
