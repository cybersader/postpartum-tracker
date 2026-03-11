/**
 * 24-hour activity profile — a smooth area chart showing average
 * activity by hour of day, collapsed from a day×hour grid.
 */
import { createSvg, svgEl } from './SvgChart';

export interface ActivityProfileOptions {
	color?: string;
	height?: string;
	/** Label for the peak annotation. Default: 'peak'. */
	peakLabel?: string;
}

const VIEW_W = 100;
const VIEW_H = 50;
const PLOT_TOP = 8;        // room for peak label above
const PLOT_BOTTOM = 42;    // room for hour labels below
const PLOT_LEFT = 1;
const PLOT_RIGHT = 99;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

const HOUR_LABELS: [number, string][] = [
	[0, '12a'], [6, '6a'], [12, '12p'], [18, '6p'], [24, '12a'],
];

/**
 * Render a 24-hour activity profile from a day×hour grid.
 * Averages each hour column across all days, then draws a smooth area chart.
 */
export function renderActivityProfile(
	parent: HTMLElement,
	/** grid[dayIndex][hourIndex] = value. Same format as HeatmapChart. */
	grid: number[][],
	opts: ActivityProfileOptions = {},
): void {
	if (grid.length === 0) return;

	const color = opts.color ?? 'var(--interactive-accent)';
	const numDays = grid.length;

	// Average each hour across all days
	const hourAvg = new Array<number>(24).fill(0);
	for (const row of grid) {
		for (let h = 0; h < 24 && h < row.length; h++) {
			hourAvg[h] += row[h];
		}
	}
	for (let h = 0; h < 24; h++) hourAvg[h] /= numDays;

	const max = Math.max(...hourAvg, 0.01);
	const peakHour = hourAvg.indexOf(max);

	const svg = createSvg(VIEW_W, VIEW_H);
	svg.classList.add('pt-activity-profile');
	svg.style.height = opts.height || '120px';

	// Gradient fill
	const gradId = `pt-ap-grad-${Math.random().toString(36).slice(2, 8)}`;
	const defs = svgEl('defs', {}, svg);
	const grad = svgEl('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
	svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.4 }, grad);
	svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0.03 }, grad);

	// Baseline
	svgEl('line', {
		x1: PLOT_LEFT, y1: PLOT_BOTTOM, x2: PLOT_RIGHT, y2: PLOT_BOTTOM,
		stroke: 'var(--background-modifier-border)',
		'stroke-width': 0.3,
	}, svg);

	// Hour grid lines + labels
	for (const [h, label] of HOUR_LABELS) {
		const x = PLOT_LEFT + (h / 24) * PLOT_W;
		svgEl('line', {
			x1: x, y1: PLOT_TOP, x2: x, y2: PLOT_BOTTOM,
			stroke: 'var(--background-modifier-border)',
			'stroke-width': 0.2,
			'stroke-dasharray': '1,1',
		}, svg);
		svgEl('text', {
			x, y: VIEW_H - 1,
			'text-anchor': 'middle', 'font-size': 3,
			fill: 'var(--text-muted)',
		}, svg).textContent = label;
	}

	// Build points (one per hour, centered in each hour slot)
	const points: [number, number][] = [];
	for (let h = 0; h < 24; h++) {
		const x = PLOT_LEFT + ((h + 0.5) / 24) * PLOT_W;
		const y = PLOT_BOTTOM - (hourAvg[h] / max) * PLOT_H;
		points.push([x, y]);
	}

	// Area polygon
	const areaStr = [
		`${points[0][0]},${PLOT_BOTTOM}`,
		...points.map(([x, y]) => `${x},${y}`),
		`${points[23][0]},${PLOT_BOTTOM}`,
	].join(' ');
	svgEl('polygon', { points: areaStr, fill: `url(#${gradId})` }, svg);

	// Line
	svgEl('polyline', {
		points: points.map(([x, y]) => `${x},${y}`).join(' '),
		fill: 'none',
		stroke: color,
		'stroke-width': 0.8,
		'stroke-linejoin': 'round',
		'stroke-linecap': 'round',
	}, svg);

	// Peak dot + label
	const peakX = points[peakHour][0];
	const peakY = points[peakHour][1];
	svgEl('circle', { cx: peakX, cy: peakY, r: 1.5, fill: color }, svg);

	const peakTime = formatHour(peakHour);
	const labelText = opts.peakLabel ? `${opts.peakLabel} ${peakTime}` : `peak ${peakTime}`;
	// Position label above the dot, shift left/right near edges
	const anchor = peakHour >= 20 ? 'end' : peakHour <= 4 ? 'start' : 'middle';
	svgEl('text', {
		x: peakX, y: Math.max(peakY - 3, 4),
		'text-anchor': anchor, 'font-size': 3,
		fill: color,
		'font-weight': '600',
	}, svg).textContent = labelText;

	parent.appendChild(svg);
}

function formatHour(h: number): string {
	if (h === 0 || h === 24) return '12am';
	if (h === 12) return '12pm';
	return h < 12 ? `${h}am` : `${h - 12}pm`;
}
