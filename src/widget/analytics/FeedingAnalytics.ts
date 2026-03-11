/**
 * Feeding analytics section with charts and insights.
 * Shows trends, time-of-day patterns, and L/R balance.
 */
import type { FeedingEntry, PostpartumTrackerSettings } from '../../types';
import { dateKeys, toDateKey, dayLabels, trendDirection, TREND_ARROWS, aggregateWeekly, collapseToWeeks } from '../charts/SvgChart';
import { renderBarChart, type BarDatum } from '../charts/BarChart';
import { renderTimelineChart, type TimelineRow } from '../charts/TimelineChart';
import { renderSparkLine } from '../charts/SparkLine';
import { renderHeatmapChart } from '../charts/HeatmapChart';
import { renderActivityProfile } from '../charts/ActivityProfile';

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

		const isWeekly = days >= 30;

		// Daily values
		const dailyCounts = keys.map(k => byDay.get(k)!.filter(e => e.end !== null).length);

		// ── Feedings per day/week ──
		if (isWeekly) {
			const agg = aggregateWeekly(dailyCounts, labels);
			const barData: BarDatum[] = agg.values.map((v, i) => ({ label: agg.labels[i], value: v }));
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Feedings (weekly avg)' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderBarChart(c, barData);
		} else {
			const countData: BarDatum[] = dailyCounts.map((v, i) => ({ label: labels[i], value: v }));
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Feedings per day' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderBarChart(c, countData, { movingAvgWindow: 3 });
		}

		// ── Nursing minutes (stacked L/R) ──
		const dailyDurationData: BarDatum[] = keys.map((k, i) => {
			const dayEntries = byDay.get(k)!.filter(e => e.end !== null && e.type !== 'bottle');
			let leftMin = 0, rightMin = 0, bothMin = 0;
			for (const e of dayEntries) {
				const dur = getDurMin(e);
				if (e.side === 'left') leftMin += dur;
				else if (e.side === 'right') rightMin += dur;
				else bothMin += dur;
			}
			return {
				label: labels[i], value: 0,
				segments: [
					{ value: Math.round(leftMin), color: 'var(--color-blue)' },
					{ value: Math.round(rightMin), color: 'var(--color-orange)' },
					{ value: Math.round(bothMin), color: 'var(--color-green)' },
				],
			};
		});

		if (isWeekly) {
			// Aggregate stacked data into weekly totals per side, then average
			const weeklyData: BarDatum[] = [];
			for (let i = 0; i < dailyDurationData.length; i += 7) {
				const chunk = dailyDurationData.slice(i, i + 7);
				const n = chunk.length;
				const avgL = chunk.reduce((s, d) => s + (d.segments?.[0]?.value || 0), 0) / n;
				const avgR = chunk.reduce((s, d) => s + (d.segments?.[1]?.value || 0), 0) / n;
				const avgB = chunk.reduce((s, d) => s + (d.segments?.[2]?.value || 0), 0) / n;
				weeklyData.push({
					label: `W${Math.floor(i / 7) + 1}`, value: 0,
					segments: [
						{ value: Math.round(avgL), color: 'var(--color-blue)' },
						{ value: Math.round(avgR), color: 'var(--color-orange)' },
						{ value: Math.round(avgB), color: 'var(--color-green)' },
					],
				});
			}
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Nursing minutes (weekly avg L/R/Both)' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderBarChart(c, weeklyData);
		} else {
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Nursing minutes (L/R/Both)' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderBarChart(c, dailyDurationData);
		}

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

		// ── Feeding heatmap ──
		const heatGrid = keys.map(k => {
			const hourBuckets = new Array<number>(24).fill(0);
			for (const e of byDay.get(k)!.filter(e => e.end !== null)) {
				const h = Math.floor(toDecimalHour(e.start));
				if (h >= 0 && h < 24) hourBuckets[h]++;
			}
			return hourBuckets;
		});

		const fmtFeedCount = (v: number) => {
			const r = Math.round(v * 10) / 10;
			return r === 1 ? '1 feed/hr' : `${r} feeds/hr`;
		};
		const fmtFeedTotal = (total: number) => `${Math.round(total)}/day`;
		if (isWeekly) {
			const { grid: wkGrid, labels: wkLabels } = collapseToWeeks(heatGrid);
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Feedings by week' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderHeatmapChart(c, wkGrid, wkLabels, {
				color: 'var(--color-blue)', showAvgRow: true,
				formatValue: fmtFeedCount, formatRowTotal: fmtFeedTotal,
			});
		} else {
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Feeding activity by hour' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderHeatmapChart(c, heatGrid, labels, {
				color: 'var(--color-blue)',
				formatValue: fmtFeedCount, formatRowTotal: fmtFeedTotal,
			});
		}

		// ── Average feeding profile ──
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Average feedings by hour' });
		const profileContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderActivityProfile(profileContainer, heatGrid, {
			color: 'var(--color-blue)',
			peakLabel: 'busiest',
		});

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
