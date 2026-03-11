/**
 * Vertical bar chart rendered as pure SVG.
 * Supports stacked bars, value labels, and moving-average overlay.
 */
import {
	createSvg, svgEl, scale, drawGridLines, drawXLabels,
	defaultPlotArea, movingAverage, type PlotArea,
} from './SvgChart';

export interface BarDatum {
	label: string;
	value: number;
	/** Optional stacked segments: [{ value, color }]. If provided, main value is ignored. */
	segments?: { value: number; color: string }[];
	color?: string;
}

export interface BarChartOptions {
	/** Chart height in CSS (default "120px"). */
	height?: string;
	/** Show value labels on top of bars. */
	showValues?: boolean;
	/** Moving average window (0 = disabled). */
	movingAvgWindow?: number;
	/** Bar corner radius (viewBox units, default 0.8). */
	cornerRadius?: number;
	/** Default bar color. */
	color?: string;
}

const VIEW_W = 100;
const VIEW_H = 40;

export function renderBarChart(
	parent: HTMLElement,
	data: BarDatum[],
	opts: BarChartOptions = {},
): void {
	if (data.length === 0) return;

	const {
		height = '120px',
		showValues = true,
		movingAvgWindow = 0,
		cornerRadius = 0.8,
		color = 'var(--interactive-accent)',
	} = opts;

	const svg = createSvg(VIEW_W, VIEW_H);
	svg.style.height = height;
	svg.classList.add('pt-bar-chart');

	const plot = defaultPlotArea(VIEW_W, VIEW_H);

	// Compute max value
	const maxRaw = Math.max(
		...data.map(d => d.segments
			? d.segments.reduce((s, seg) => s + seg.value, 0)
			: d.value),
		1,
	);
	const maxVal = niceMax(maxRaw);

	// Grid
	drawGridLines(svg, plot, 3, maxVal);

	// Bars
	const barWidth = (plot.right - plot.left) / data.length * 0.7;
	const gap = (plot.right - plot.left) / data.length * 0.3;

	for (let i = 0; i < data.length; i++) {
		const d = data[i];
		const x = plot.left + i * (barWidth + gap) + gap / 2;

		if (d.segments && d.segments.length > 0) {
			// Stacked bar
			let y = plot.bottom;
			for (const seg of d.segments) {
				const barH = scale(seg.value, 0, maxVal, 0, plot.bottom - plot.top);
				if (barH > 0) {
					svgEl('rect', {
						x, y: y - barH, width: barWidth, height: barH,
						rx: cornerRadius, ry: cornerRadius,
						fill: seg.color,
						class: 'pt-chart-bar',
					}, svg);
					y -= barH;
				}
			}
			// Value label
			if (showValues) {
				const total = d.segments.reduce((s, seg) => s + seg.value, 0);
				if (total > 0) {
					const topY = scale(total, 0, maxVal, plot.bottom, plot.top);
					svgEl('text', {
						x: x + barWidth / 2, y: topY - 1,
						'text-anchor': 'middle', 'font-size': 2.5,
						fill: 'var(--text-normal)',
					}, svg).textContent = String(Math.round(total));
				}
			}
		} else {
			// Simple bar
			const barH = scale(d.value, 0, maxVal, 0, plot.bottom - plot.top);
			if (barH > 0) {
				svgEl('rect', {
					x, y: plot.bottom - barH, width: barWidth, height: barH,
					rx: cornerRadius, ry: cornerRadius,
					fill: d.color || color,
					class: 'pt-chart-bar',
				}, svg);
			}
			if (showValues && d.value > 0) {
				const topY = scale(d.value, 0, maxVal, plot.bottom, plot.top);
				svgEl('text', {
					x: x + barWidth / 2, y: topY - 1,
					'text-anchor': 'middle', 'font-size': 2.5,
					fill: 'var(--text-normal)',
				}, svg).textContent = String(Math.round(d.value));
			}
		}
	}

	// X-axis labels
	drawXLabels(svg, data.map(d => d.label), plot, VIEW_H - 1);

	// Moving average line
	if (movingAvgWindow > 0) {
		const values = data.map(d => d.segments
			? d.segments.reduce((s, seg) => s + seg.value, 0)
			: d.value);
		const avg = movingAverage(values, movingAvgWindow);
		const points: string[] = [];
		for (let i = 0; i < avg.length; i++) {
			if (avg[i] === null) continue;
			const x = plot.left + i * (barWidth + gap) + gap / 2 + barWidth / 2;
			const y = scale(avg[i]!, 0, maxVal, plot.bottom, plot.top);
			points.push(`${x},${y}`);
		}
		if (points.length > 1) {
			svgEl('polyline', {
				points: points.join(' '),
				fill: 'none',
				stroke: 'var(--text-accent)',
				'stroke-width': 0.6,
				'stroke-dasharray': '1.5,1',
				class: 'pt-chart-avg-line',
			}, svg);
		}
	}

	parent.appendChild(svg);
}

/** Round up to a "nice" max for axis. */
function niceMax(val: number): number {
	if (val <= 5) return Math.max(val, 1);
	if (val <= 10) return 10;
	if (val <= 20) return 20;
	return Math.ceil(val / 5) * 5;
}
