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
	/** Show a dashed horizontal line at the overall average. */
	showAvgLine?: boolean;
	/** Format the average value for the label. Default: round to 1 decimal. */
	formatAvg?: (avg: number) => string;
	/** Format a raw value for Y-axis ticks. When provided, Y-axis labels are shown. */
	formatValue?: (v: number) => string;
	/** Show interval labels ("every 2h 30m") on peak and Y-axis. */
	showIntervalLabels?: boolean;
	/** Second dataset to overlay (e.g. stop events on top of start events). */
	overlayGrid?: number[][];
	/** Color for the overlay curve. Default: 'var(--color-orange)'. */
	overlayColor?: string;
	/** Peak label for the overlay. Default: 'stops peak'. */
	overlayLabel?: string;
}

const VIEW_W = 100;
const VIEW_H = 50;
const PLOT_TOP = 8;        // room for peak label above
const PLOT_BOTTOM = 42;    // room for hour labels below
const PLOT_LEFT_NO_AXIS = 1;
const PLOT_LEFT_WITH_AXIS = 14;  // room for Y-axis labels
const PLOT_RIGHT = 99;
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
	const hasYAxis = !!opts.formatValue;
	const PLOT_LEFT = hasYAxis ? PLOT_LEFT_WITH_AXIS : PLOT_LEFT_NO_AXIS;
	const PLOT_W = PLOT_RIGHT - PLOT_LEFT;

	// Average each hour across all days
	const hourAvg = new Array<number>(24).fill(0);
	for (const row of grid) {
		for (let h = 0; h < 24 && h < row.length; h++) {
			hourAvg[h] += row[h];
		}
	}
	for (let h = 0; h < 24; h++) hourAvg[h] /= numDays;

	// Gaussian-weighted moving average (wraps around midnight)
	const smoothed = gaussianSmooth(hourAvg, 2);

	const max = Math.max(...smoothed, 0.01);
	const peakHour = smoothed.indexOf(max);

	const svg = createSvg(VIEW_W, VIEW_H);
	svg.classList.add('pt-activity-profile');
	// No fixed height — let viewBox ratio (2:1) scale naturally with container width

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

	// Y-axis ticks (0, mid, max)
	if (hasYAxis) {
		const ticks = [0, max / 2, max];
		for (const v of ticks) {
			const y = PLOT_BOTTOM - (v / max) * PLOT_H;
			svgEl('line', {
				x1: PLOT_LEFT - 1, y1: y, x2: PLOT_LEFT, y2: y,
				stroke: 'var(--background-modifier-border)',
				'stroke-width': 0.3,
			}, svg);
			svgEl('text', {
				x: PLOT_LEFT - 2, y: y + 1,
				'text-anchor': 'end', 'font-size': 2.6,
				fill: 'var(--text-muted)',
			}, svg).textContent = opts.formatValue!(v);
		}
	}

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
		const y = PLOT_BOTTOM - (smoothed[h] / max) * PLOT_H;
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

	// Average line
	if (opts.showAvgLine) {
		const avg = smoothed.reduce((a, b) => a + b, 0) / 24;
		const avgY = PLOT_BOTTOM - (avg / max) * PLOT_H;
		svgEl('line', {
			x1: PLOT_LEFT, y1: avgY, x2: PLOT_RIGHT, y2: avgY,
			stroke: 'var(--text-muted)',
			'stroke-width': 0.3,
			'stroke-dasharray': '1.5,1',
		}, svg);
		const avgLabel = opts.formatAvg ? opts.formatAvg(avg) : `avg ${Math.round(avg * 10) / 10}`;
		svgEl('text', {
			x: PLOT_RIGHT - 1, y: avgY - 1.5,
			'text-anchor': 'end', 'font-size': 2.8,
			fill: 'var(--text-muted)',
		}, svg).textContent = avgLabel;
	}

	// Peak dot + label
	const peakX = points[peakHour][0];
	const peakY = points[peakHour][1];
	svgEl('circle', { cx: peakX, cy: peakY, r: 1.5, fill: color }, svg);

	const peakTime = formatHour(peakHour);
	const intervalSuffix = opts.showIntervalLabels && smoothed[peakHour] > 0
		? ` (${formatInterval(smoothed[peakHour])})` : '';
	const labelText = (opts.peakLabel ? `${opts.peakLabel} ${peakTime}` : `peak ${peakTime}`) + intervalSuffix;
	const anchor = peakHour >= 20 ? 'end' : peakHour <= 4 ? 'start' : 'middle';
	svgEl('text', {
		x: peakX, y: Math.max(peakY - 3, 4),
		'text-anchor': anchor, 'font-size': 3,
		fill: color,
		'font-weight': '600',
	}, svg).textContent = labelText;

	// ── Overlay (second dataset, e.g. stop events) ──
	if (opts.overlayGrid && opts.overlayGrid.length > 0) {
		const oColor = opts.overlayColor ?? 'var(--color-orange)';
		const oNumDays = opts.overlayGrid.length;

		// Average overlay hours
		const oHourAvg = new Array<number>(24).fill(0);
		for (const row of opts.overlayGrid) {
			for (let h = 0; h < 24 && h < row.length; h++) {
				oHourAvg[h] += row[h];
			}
		}
		for (let h = 0; h < 24; h++) oHourAvg[h] /= oNumDays;

		const oSmoothed = gaussianSmooth(oHourAvg, 2);
		// Use SAME max as primary so both curves are comparable
		const oMax = max;
		const oPeakHour = oSmoothed.indexOf(Math.max(...oSmoothed));

		// Overlay gradient
		const oGradId = `pt-ap-ograd-${Math.random().toString(36).slice(2, 8)}`;
		const oDefs = svgEl('defs', {}, svg);
		const oGrad = svgEl('linearGradient', { id: oGradId, x1: 0, y1: 0, x2: 0, y2: 1 }, oDefs);
		svgEl('stop', { offset: '0%', 'stop-color': oColor, 'stop-opacity': 0.25 }, oGrad);
		svgEl('stop', { offset: '100%', 'stop-color': oColor, 'stop-opacity': 0.02 }, oGrad);

		// Overlay points
		const oPoints: [number, number][] = [];
		for (let h = 0; h < 24; h++) {
			const x = PLOT_LEFT + ((h + 0.5) / 24) * PLOT_W;
			const y = PLOT_BOTTOM - (oSmoothed[h] / oMax) * PLOT_H;
			oPoints.push([x, y]);
		}

		// Overlay area
		const oAreaStr = [
			`${oPoints[0][0]},${PLOT_BOTTOM}`,
			...oPoints.map(([x, y]) => `${x},${y}`),
			`${oPoints[23][0]},${PLOT_BOTTOM}`,
		].join(' ');
		svgEl('polygon', { points: oAreaStr, fill: `url(#${oGradId})` }, svg);

		// Overlay line (dashed)
		svgEl('polyline', {
			points: oPoints.map(([x, y]) => `${x},${y}`).join(' '),
			fill: 'none',
			stroke: oColor,
			'stroke-width': 0.7,
			'stroke-dasharray': '1.5,1',
			'stroke-linejoin': 'round',
			'stroke-linecap': 'round',
		}, svg);

		// Overlay peak dot + label
		const oPeakX = oPoints[oPeakHour][0];
		const oPeakY = oPoints[oPeakHour][1];
		svgEl('circle', { cx: oPeakX, cy: oPeakY, r: 1.2, fill: oColor }, svg);

		const oPeakTime = formatHour(oPeakHour);
		const oLabelText = opts.overlayLabel ? `${opts.overlayLabel} ${oPeakTime}` : `stops ${oPeakTime}`;
		const oAnchor = oPeakHour >= 20 ? 'end' : oPeakHour <= 4 ? 'start' : 'middle';
		// Offset label below primary peak to avoid collision
		const oLabelY = Math.min(oPeakY + 4, PLOT_BOTTOM - 2);
		svgEl('text', {
			x: oPeakX, y: oLabelY,
			'text-anchor': oAnchor, 'font-size': 2.8,
			fill: oColor,
			'font-weight': '500',
		}, svg).textContent = oLabelText;
	}

	parent.appendChild(svg);
}

/**
 * Gaussian-weighted moving average that wraps around (circular).
 * sigma controls smoothing width — higher = smoother.
 */
function gaussianSmooth(data: number[], sigma: number): number[] {
	const n = data.length;
	const result = new Array<number>(n).fill(0);
	// Pre-compute weights for the kernel (±3σ covers 99.7%)
	const radius = Math.ceil(sigma * 3);
	const weights: number[] = [];
	let weightSum = 0;
	for (let d = -radius; d <= radius; d++) {
		const w = Math.exp(-(d * d) / (2 * sigma * sigma));
		weights.push(w);
		weightSum += w;
	}
	// Normalize
	for (let i = 0; i < weights.length; i++) weights[i] /= weightSum;

	for (let i = 0; i < n; i++) {
		let sum = 0;
		for (let d = -radius; d <= radius; d++) {
			const j = ((i + d) % n + n) % n; // circular wrap
			sum += data[j] * weights[d + radius];
		}
		result[i] = sum;
	}
	return result;
}

function formatHour(h: number): string {
	if (h === 0 || h === 24) return '12am';
	if (h === 12) return '12pm';
	return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** Convert events-per-hour to a human-readable interval. */
export function formatInterval(eventsPerHour: number): string {
	if (eventsPerHour <= 0) return '—';
	const minsBetween = 60 / eventsPerHour;
	if (minsBetween >= 120) {
		const h = Math.floor(minsBetween / 60);
		const m = Math.round(minsBetween % 60);
		return m > 0 ? `every ${h}h ${m}m` : `every ${h}h`;
	}
	if (minsBetween >= 60) {
		const m = Math.round(minsBetween % 60);
		return m > 0 ? `every 1h ${m}m` : `every 1h`;
	}
	return `every ${Math.round(minsBetween)}m`;
}

/**
 * Find the N-hour window with the highest/lowest average in a smoothed 24h array.
 * Returns { startHour, avg }.
 */
export function findWindow(
	smoothed: number[], windowSize: number, mode: 'max' | 'min'
): { startHour: number; avg: number } {
	let best = mode === 'max' ? -Infinity : Infinity;
	let bestStart = 0;
	for (let h = 0; h < 24; h++) {
		let sum = 0;
		for (let d = 0; d < windowSize; d++) {
			sum += smoothed[(h + d) % 24];
		}
		const avg = sum / windowSize;
		if (mode === 'max' ? avg > best : (avg < best && avg > 0)) {
			best = avg;
			bestStart = h;
		}
	}
	return { startHour: bestStart, avg: best === -Infinity || best === Infinity ? 0 : best };
}
