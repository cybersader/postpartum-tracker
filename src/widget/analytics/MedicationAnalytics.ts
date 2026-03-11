/**
 * Medication analytics with charts and insights.
 * Shows dose frequency, timing compliance, and pain coverage.
 */
import type { MedicationEntry, MedicationConfig, PostpartumTrackerSettings } from '../../types';
import { DEFAULT_MEDICATIONS } from '../../types';
import { dateKeys, toDateKey, dayLabels } from '../charts/SvgChart';
import { renderBarChart, type BarDatum } from '../charts/BarChart';
import { renderTimelineChart, type TimelineRow } from '../charts/TimelineChart';

export class MedicationAnalytics {
	private el: HTMLElement;

	constructor(parent: HTMLElement) {
		this.el = parent.createDiv({ cls: 'pt-analytics pt-med-analytics' });
	}

	render(
		entries: MedicationEntry[],
		configs: MedicationConfig[],
		settings: PostpartumTrackerSettings,
	): void {
		this.el.empty();
		const days = (settings as any).analyticsWindowDays || 7;
		const keys = dateKeys(days);
		const labels = dayLabels(days);

		// Only show enabled medications with entries in the window
		const enabledMeds = (configs || DEFAULT_MEDICATIONS).filter(c => c.enabled);
		const medNames = enabledMeds.map(c => c.name);

		const byDay = new Map<string, MedicationEntry[]>();
		for (const k of keys) byDay.set(k, []);
		for (const e of entries) {
			const k = toDateKey(e.timestamp);
			if (byDay.has(k)) byDay.get(k)!.push(e);
		}

		// Assign colors to medications
		const colors = [
			'var(--interactive-accent)',
			'var(--color-orange)',
			'var(--color-green)',
			'var(--color-purple)',
			'var(--color-red)',
			'var(--color-blue)',
		];
		const medColor = new Map<string, string>();
		medNames.forEach((name, i) => medColor.set(name.toLowerCase(), colors[i % colors.length]));

		// ── Doses per day (stacked by medication) ──
		const doseData: BarDatum[] = keys.map((k, i) => {
			const dayEntries = byDay.get(k)!;
			const segments = medNames.map(name => ({
				value: dayEntries.filter(e => e.name.toLowerCase() === name.toLowerCase()).length,
				color: medColor.get(name.toLowerCase()) || colors[0],
			}));
			return { label: labels[i], value: 0, segments };
		});
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Doses per day' });
		// Legend
		const legend = this.el.createDiv({ cls: 'pt-chart-legend' });
		for (const name of medNames) {
			const item = legend.createSpan({ cls: 'pt-legend-item' });
			const swatch = item.createSpan({ cls: 'pt-legend-swatch' });
			swatch.style.backgroundColor = medColor.get(name.toLowerCase()) || colors[0];
			item.createSpan({ text: ` ${name}` });
		}
		const doseContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderBarChart(doseContainer, doseData);

		// ── Medication timeline (last 3 days) ──
		const timelineDays = Math.min(3, days);
		const recentKeys = keys.slice(-timelineDays);
		const recentLabels = labels.slice(-timelineDays);
		const rows: TimelineRow[] = recentKeys.map((k, i) => ({
			dayLabel: recentLabels[i],
			blocks: byDay.get(k)!.map(e => ({
				startHour: toDecimalHour(e.timestamp),
				color: medColor.get(e.name.toLowerCase()) || 'var(--text-muted)',
			})),
		}));
		this.el.createDiv({ cls: 'pt-analytics-title', text: 'Dose timing' });
		const tlContainer = this.el.createDiv({ cls: 'pt-chart-container' });
		renderTimelineChart(tlContainer, rows);

		// ── Insights ──
		const insightsEl = this.el.createDiv({ cls: 'pt-insights' });

		// Pain coverage (last 24h)
		const now = Date.now();
		const last24h = entries.filter(e =>
			now - new Date(e.timestamp).getTime() < 24 * 3600000);
		if (last24h.length > 0) {
			// Calculate covered hours (each dose covers minIntervalHours)
			let coveredMs = 0;
			for (const e of last24h) {
				const config = enabledMeds.find(c => c.name.toLowerCase() === e.name.toLowerCase());
				if (config) {
					coveredMs += config.minIntervalHours * 3600000;
				}
			}
			const coveredH = Math.min(24, Math.round(coveredMs / 3600000 * 10) / 10);
			addInsight(insightsEl, `Pain coverage: ~${coveredH}h of last 24h`, 'neutral');
		}

		// Average gap between doses (for each med)
		for (const config of enabledMeds) {
			const medEntries = entries
				.filter(e => e.name.toLowerCase() === config.name.toLowerCase())
				.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			if (medEntries.length >= 2) {
				let totalGap = 0;
				for (let i = 1; i < medEntries.length; i++) {
					totalGap += new Date(medEntries[i].timestamp).getTime() - new Date(medEntries[i - 1].timestamp).getTime();
				}
				const avgGapH = totalGap / (medEntries.length - 1) / 3600000;
				const gh = Math.floor(avgGapH);
				const gm = Math.round((avgGapH - gh) * 60);
				const targetH = config.minIntervalHours;
				const compliance = avgGapH >= targetH ? 'on schedule' : 'shorter than interval';
				addInsight(insightsEl,
					`${config.name}: avg gap ${gh}h ${gm}m (target: ${targetH}h) - ${compliance}`,
					avgGapH >= targetH ? 'positive' : 'negative',
				);
			}
		}

		// Today's dose count
		const todayKey = keys[keys.length - 1];
		const todayCount = byDay.get(todayKey)!.length;
		addInsight(insightsEl, `${todayCount} doses today`, 'neutral');
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
