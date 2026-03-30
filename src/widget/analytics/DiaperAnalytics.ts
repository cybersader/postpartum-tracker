/**
 * Diaper analytics with charts and insights.
 * Shows wet/dirty counts, heatmap, frequency profile, rhythm, sparklines,
 * stool color progression, and adequacy checks.
 */
import type { DiaperEntry, PostpartumTrackerSettings } from '../../types';
import { dateKeys, toDateKey, dayLabels, trendDirection, TREND_ARROWS, aggregateWeekly, collapseToWeeks } from '../charts/SvgChart';
import { renderBarChart, type BarDatum } from '../charts/BarChart';
import { renderTimelineChart, type TimelineRow } from '../charts/TimelineChart';
import { renderHeatmapChart } from '../charts/HeatmapChart';
import { renderActivityProfile, formatInterval, findWindow } from '../charts/ActivityProfile';
import { renderSparkLine } from '../charts/SparkLine';
import { daysSinceBirth } from '../../data/dateUtils';

export class DiaperAnalytics {
	private el: HTMLElement;

	constructor(parent: HTMLElement) {
		this.el = parent.createDiv({ cls: 'pt-analytics pt-diaper-analytics' });
	}

	render(entries: DiaperEntry[], settings: PostpartumTrackerSettings, windowDays: number, birthDate?: string): void {
		this.el.empty();
		const days = windowDays;
		const keys = dateKeys(days);
		const labels = dayLabels(days);

		const byDay = new Map<string, DiaperEntry[]>();
		for (const k of keys) byDay.set(k, []);
		for (const e of entries) {
			const k = toDateKey(e.timestamp);
			if (byDay.has(k)) byDay.get(k)!.push(e);
		}

		// ── Wet + Dirty counts (stacked bar) ──
		const isWeekly = days >= 30;
		const dailyCountData: BarDatum[] = keys.map((k, i) => {
			const dayEntries = byDay.get(k)!;
			const wet = dayEntries.filter(e => e.wet).length;
			const dirty = dayEntries.filter(e => e.dirty).length;
			return {
				label: labels[i], value: 0,
				segments: [
					{ value: wet, color: 'var(--color-blue)' },
					{ value: dirty, color: 'var(--color-yellow)' },
				],
			};
		});

		if (isWeekly) {
			const weeklyData: BarDatum[] = [];
			for (let i = 0; i < dailyCountData.length; i += 7) {
				const chunk = dailyCountData.slice(i, i + 7);
				const n = chunk.length;
				const avgW = chunk.reduce((s, d) => s + (d.segments?.[0]?.value || 0), 0) / n;
				const avgD = chunk.reduce((s, d) => s + (d.segments?.[1]?.value || 0), 0) / n;
				weeklyData.push({
					label: `W${Math.floor(i / 7) + 1}`, value: 0,
					segments: [
						{ value: Math.round(avgW * 10) / 10, color: 'var(--color-blue)' },
						{ value: Math.round(avgD * 10) / 10, color: 'var(--color-yellow)' },
					],
				});
			}
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Diapers (weekly avg wet/dirty)' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderBarChart(c, weeklyData);
		} else {
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Diapers per day (wet/dirty)' });
			const c = this.el.createDiv({ cls: 'pt-chart-container' });
			renderBarChart(c, dailyCountData);
		}

		// ── Heatmap (hour × day) ──
		const heatGrid = keys.map(k => {
			const hourBuckets = new Array<number>(24).fill(0);
			for (const e of byDay.get(k)!) {
				const h = Math.floor(toDecimalHour(e.timestamp));
				if (h >= 0 && h < 24) hourBuckets[h]++;
			}
			return hourBuckets;
		});

		if (days < 30) {
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Change times heatmap' });
			const heatContainer = this.el.createDiv({ cls: 'pt-chart-container' });
			const fmtCount = (v: number) => v === 0 ? '' : String(Math.round(v));
			const fmtTotal = (v: number) => String(Math.round(v));
			renderHeatmapChart(heatContainer, heatGrid, labels, {
				color: 'var(--color-yellow)',
				formatValue: fmtCount, formatRowTotal: fmtTotal,
			});
		} else {
			const { grid: weekGrid, labels: weekLabels } = collapseToWeeks(heatGrid);
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Change times heatmap (weekly)' });
			const heatContainer = this.el.createDiv({ cls: 'pt-chart-container' });
			renderHeatmapChart(heatContainer, weekGrid, weekLabels, {
				color: 'var(--color-yellow)',
			});
		}

		// ── Change frequency by hour (activity profile) ──
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Diaper change frequency by hour' });
		const profileContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderActivityProfile(profileContainer, heatGrid, {
			color: 'var(--color-yellow)',
			peakLabel: 'busiest',
			showAvgLine: true,
			showIntervalLabels: true,
			formatAvg: (v) => {
				const r = Math.round(v * 10) / 10;
				return `avg ${r}/hr (${formatInterval(v)})`;
			},
			formatValue: (v) => `${Math.round(v * 10) / 10}/hr`,
		});

		// Busiest/quietest window insights
		{
			const hourAvg = new Array<number>(24).fill(0);
			for (const row of heatGrid) {
				for (let h = 0; h < 24 && h < row.length; h++) hourAvg[h] += row[h];
			}
			for (let h = 0; h < 24; h++) hourAvg[h] /= heatGrid.length;

			const busiest = findWindow(hourAvg, 3, 'max');
			const quietest = findWindow(hourAvg, 3, 'min');

			if (busiest.avg > 0) {
				const windowInsights = this.el.createDiv({ cls: 'pt-insights' });
				const bEnd = (busiest.startHour + 3) % 24;
				addInsight(windowInsights, `Busiest: ${fmtH(busiest.startHour)}–${fmtH(bEnd)} (${formatInterval(busiest.avg)})`, 'neutral');
				if (quietest.avg > 0 && quietest.avg < busiest.avg) {
					const qEnd = (quietest.startHour + 3) % 24;
					addInsight(windowInsights, `Quietest: ${fmtH(quietest.startHour)}–${fmtH(qEnd)} (${formatInterval(quietest.avg)})`, 'neutral');
				}
			}
		}

		// ── Wet vs Dirty rhythm (overlaid activity profile) ──
		{
			this.el.createDiv({ cls: 'pt-analytics-title', text: 'Wet vs dirty rhythm' });
			this.el.createDiv({ cls: 'pt-analytics-subtitle', text: 'When wet changes (solid) and dirty changes (dashed) happen' });

			const wetGrid = keys.map(k => {
				const hourBuckets = new Array<number>(24).fill(0);
				for (const e of byDay.get(k)!.filter(e => e.wet)) {
					const h = Math.floor(toDecimalHour(e.timestamp));
					if (h >= 0 && h < 24) hourBuckets[h]++;
				}
				return hourBuckets;
			});
			const dirtyGrid = keys.map(k => {
				const hourBuckets = new Array<number>(24).fill(0);
				for (const e of byDay.get(k)!.filter(e => e.dirty)) {
					const h = Math.floor(toDecimalHour(e.timestamp));
					if (h >= 0 && h < 24) hourBuckets[h]++;
				}
				return hourBuckets;
			});

			const rhythmContainer = this.el.createDiv({ cls: 'pt-chart-container' });
			renderActivityProfile(rhythmContainer, wetGrid, {
				color: 'var(--color-blue)',
				peakLabel: 'wet peak',
				showIntervalLabels: true,
				formatValue: (v) => `${Math.round(v * 10) / 10}/hr`,
				overlayGrid: dirtyGrid,
				overlayColor: 'var(--color-yellow)',
				overlayLabel: 'dirty peak',
			});

			const legend = this.el.createDiv({ cls: 'pt-chart-legend' });
			const wetItem = legend.createDiv({ cls: 'pt-legend-item' });
			wetItem.createSpan({ cls: 'pt-legend-swatch' }).style.cssText = 'background: var(--color-blue)';
			wetItem.createSpan({ text: 'Wet' });
			const dirtyItem = legend.createDiv({ cls: 'pt-legend-item' });
			dirtyItem.createSpan({ cls: 'pt-legend-swatch' }).style.cssText = 'background: var(--color-yellow); opacity: 0.6';
			dirtyItem.createSpan({ text: 'Dirty' });
		}

		// ── Time-of-day dot plot (last 3 days) ──
		const timelineDays = Math.min(3, days);
		const recentKeys = keys.slice(-timelineDays);
		const recentLabels = labels.slice(-timelineDays);
		const rows: TimelineRow[] = recentKeys.map((k, i) => ({
			dayLabel: recentLabels[i],
			blocks: byDay.get(k)!.map(e => {
				const hour = toDecimalHour(e.timestamp);
				const color = e.dirty ? 'var(--color-yellow)' : 'var(--color-blue)';
				return { startHour: hour, color };
			}),
		}));
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Diaper change times' });
		const tlContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderTimelineChart(tlContainer, rows);

		// ── Sparklines (3 trends) ──
		const sparkH = `${settings.sparklineHeight ?? 48}px`;
		const dailyTotals = keys.map(k => byDay.get(k)!.length);
		const dailyWet = keys.map(k => byDay.get(k)!.filter(e => e.wet).length);
		const dailyDirty = keys.map(k => byDay.get(k)!.filter(e => e.dirty).length);

		if (days >= 3) {
			this.el.createDiv({ cls: 'pt-analytics-mini-title', text: 'Total changes/day trend' });
			const totalSparkEl = this.el.createDiv({ cls: 'pt-sparkline-container' });
			renderSparkLine(totalSparkEl, dailyTotals, { formatValue: (v) => `${Math.round(v)}`, height: sparkH });

			this.el.createDiv({ cls: 'pt-analytics-mini-title', text: 'Wet/day trend' });
			const wetSparkEl = this.el.createDiv({ cls: 'pt-sparkline-container' });
			renderSparkLine(wetSparkEl, dailyWet, { formatValue: (v) => `${Math.round(v)}`, height: sparkH, color: 'var(--color-blue)' });

			this.el.createDiv({ cls: 'pt-analytics-mini-title', text: 'Dirty/day trend' });
			const dirtySparkEl = this.el.createDiv({ cls: 'pt-sparkline-container' });
			renderSparkLine(dirtySparkEl, dailyDirty, { formatValue: (v) => `${Math.round(v)}`, height: sparkH, color: 'var(--color-yellow)' });
		}

		// ── Insights ──
		const insightsEl = this.el.createDiv({ cls: 'pt-insights' });

		const todayKey = keys[keys.length - 1];
		const todayEntries = byDay.get(todayKey)!;
		const wetToday = todayEntries.filter(e => e.wet).length;
		const dirtyToday = todayEntries.filter(e => e.dirty).length;
		addInsight(insightsEl, `Today: ${wetToday} wet, ${dirtyToday} dirty`, 'neutral');

		// Avg changes/day
		const nonZero = dailyTotals.filter(c => c > 0);
		if (nonZero.length > 0) {
			const avg = Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length * 10) / 10;
			const trend = trendDirection(dailyTotals);
			addInsight(insightsEl, `${avg} changes/day avg ${TREND_ARROWS[trend]}`, trend);
		}

		// Wet/dirty ratio
		const totalWet = entries.filter(e => e.wet).length;
		const totalDirty = entries.filter(e => e.dirty).length;
		const total = totalWet + totalDirty || 1;
		const wetPct = Math.round((totalWet / total) * 100);
		addInsight(insightsEl, `Wet/dirty split: ${wetPct}% wet, ${100 - wetPct}% dirty`, 'neutral');

		// Avg time between changes
		const allSorted = entries
			.filter(e => keys.includes(toDateKey(e.timestamp)))
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		if (allSorted.length >= 2) {
			let totalGap = 0;
			let gapCount = 0;
			for (let i = 1; i < allSorted.length; i++) {
				const gap = new Date(allSorted[i].timestamp).getTime() - new Date(allSorted[i - 1].timestamp).getTime();
				if (gap > 0 && gap < 12 * 3600000) {
					totalGap += gap;
					gapCount++;
				}
			}
			if (gapCount > 0) {
				const avgGapMs = totalGap / gapCount;
				const avgH = Math.floor(avgGapMs / 3600000);
				const avgM = Math.round((avgGapMs % 3600000) / 60000);
				const label = avgH > 0 ? `${avgH}h ${avgM}m` : `${avgM}m`;
				addInsight(insightsEl, `Avg time between changes: ${label}`, 'neutral');
			}
		}

		// Adequacy by day-of-life
		if (birthDate) {
			const dol = daysSinceBirth(birthDate);
			let target = '';
			if (dol <= 1) target = 'Day 1: expect 1-2 wet, 1+ dirty';
			else if (dol <= 2) target = 'Day 2: expect 2-3 wet, 1-2 dirty';
			else if (dol <= 3) target = 'Day 3: expect 3-4 wet, 2-3 dirty';
			else if (dol <= 7) target = `Day ${dol}: expect 6+ wet, 3-4 dirty`;
			else target = 'After week 1: 6+ wet, 3+ dirty/day';
			addInsight(insightsEl, target, 'neutral');
		}

		// Stool color progression (last 10 dirty entries)
		const recentDirty = entries
			.filter(e => e.dirty && e.color)
			.slice(-10);
		if (recentDirty.length > 0) {
			const colorEl = insightsEl.createDiv({ cls: 'pt-insight pt-insight--neutral' });
			colorEl.createSpan({ text: 'Stool colors: ' });
			const colorMap: Record<string, string> = {
				'meconium': '#1a1a1a',
				'transitional': '#5c6b3a',
				'yellow-seedy': '#d4a017',
				'green': '#3a7a3a',
				'brown': '#8b5e3c',
				'other': '#999',
			};
			for (const e of recentDirty) {
				const dot = colorEl.createSpan({ cls: 'pt-color-dot' });
				dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 2px;background:${colorMap[e.color || ''] || '#999'}`;
				dot.title = (e.color || 'unknown').replace(/-/g, ' ');
			}
			const lastColor = recentDirty[recentDirty.length - 1].color;
			const colorLabel = lastColor === 'yellow-seedy' ? ' (normal)'
				: lastColor === 'transitional' ? ' (expected early on)'
				: lastColor === 'meconium' ? ' (first days)'
				: lastColor === 'green' ? ' (foremilk/hindmilk imbalance?)'
				: '';
			if (colorLabel) colorEl.createSpan({ text: colorLabel, cls: 'pt-color-context' });
		}
	}

	getEl(): HTMLElement { return this.el; }
}

function toDecimalHour(iso: string): number {
	const d = new Date(iso);
	return d.getHours() + d.getMinutes() / 60;
}

function addInsight(parent: HTMLElement, text: string, type: string): void {
	parent.createDiv({ cls: `pt-insight pt-insight--${type}`, text });
}

function fmtH(h: number): string {
	if (h === 0 || h === 24) return '12am';
	if (h === 12) return '12pm';
	return h < 12 ? `${h}am` : `${h - 12}pm`;
}
