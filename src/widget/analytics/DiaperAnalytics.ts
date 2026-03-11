/**
 * Diaper analytics with charts and insights.
 * Shows wet/dirty counts, stool color progression, and adequacy checks.
 */
import type { DiaperEntry, PostpartumTrackerSettings } from '../../types';
import { dateKeys, toDateKey, dayLabels, trendDirection, TREND_ARROWS } from '../charts/SvgChart';
import { renderBarChart, type BarDatum } from '../charts/BarChart';
import { renderTimelineChart, type TimelineRow } from '../charts/TimelineChart';
import { daysSinceBirth } from '../../data/dateUtils';

export class DiaperAnalytics {
	private el: HTMLElement;

	constructor(parent: HTMLElement) {
		this.el = parent.createDiv({ cls: 'pt-analytics pt-diaper-analytics' });
	}

	render(entries: DiaperEntry[], settings: PostpartumTrackerSettings, birthDate?: string): void {
		this.el.empty();
		const days = (settings as any).analyticsWindowDays || 7;
		const keys = dateKeys(days);
		const labels = dayLabels(days);

		const byDay = new Map<string, DiaperEntry[]>();
		for (const k of keys) byDay.set(k, []);
		for (const e of entries) {
			const k = toDateKey(e.timestamp);
			if (byDay.has(k)) byDay.get(k)!.push(e);
		}

		// ── Wet + Dirty counts (stacked bar) ──
		const countData: BarDatum[] = keys.map((k, i) => {
			const dayEntries = byDay.get(k)!;
			const wet = dayEntries.filter(e => e.wet).length;
			const dirty = dayEntries.filter(e => e.dirty).length;
			return {
				label: labels[i],
				value: 0,
				segments: [
					{ value: wet, color: 'var(--color-blue)' },
					{ value: dirty, color: 'var(--color-yellow)' },
				],
			};
		});
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Diapers per day (wet/dirty)' });
		const countContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderBarChart(countContainer, countData);

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

		// ── Insights ──
		const insightsEl = this.el.createDiv({ cls: 'pt-insights' });

		const todayKey = keys[keys.length - 1];
		const todayEntries = byDay.get(todayKey)!;
		const wetToday = todayEntries.filter(e => e.wet).length;
		const dirtyToday = todayEntries.filter(e => e.dirty).length;
		addInsight(insightsEl, `Today: ${wetToday} wet, ${dirtyToday} dirty`, 'neutral');

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

		// Stool color trend
		const recentDirty = entries
			.filter(e => e.dirty && e.color)
			.slice(-5);
		if (recentDirty.length > 0) {
			const lastColor = recentDirty[recentDirty.length - 1].color;
			const colorLabel = lastColor === 'yellow-seedy' ? 'yellow-seedy (normal)'
				: lastColor === 'transitional' ? 'transitional (expected early on)'
				: lastColor === 'meconium' ? 'meconium (first days)'
				: lastColor === 'green' ? 'green (may indicate foremilk/hindmilk imbalance)'
				: lastColor || 'unknown';
			addInsight(insightsEl, `Recent stool: ${colorLabel}`, 'neutral');
		}

		// Total trend
		const dailyCounts = keys.map(k => byDay.get(k)!.length);
		const trend = trendDirection(dailyCounts);
		addInsight(insightsEl, `Volume trend: ${TREND_ARROWS[trend]}`, trend);
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
