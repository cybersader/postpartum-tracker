/**
 * Inline mini sparkline — a compact trend line with value labels.
 */
import { createSvg, svgEl } from './SvgChart';

export interface SparkLineOptions {
	height?: string;
	color?: string;
	showArea?: boolean;
	/** Format values for min/max/latest labels. When set, labels are shown. */
	formatValue?: (v: number) => string;
}

const VIEW_W = 60;
const VIEW_H = 20;
const PAD = 1;
const LABEL_W = 12;  // space reserved for right-side labels

export function renderSparkLine(
	parent: HTMLElement,
	values: number[],
	opts: SparkLineOptions = {},
): void {
	if (values.length < 2) return;

	const {
		height = '32px',
		color = 'var(--interactive-accent)',
		showArea = true,
		formatValue,
	} = opts;

	const hasLabels = !!formatValue;
	const plotRight = hasLabels ? VIEW_W - LABEL_W : VIEW_W - PAD;

	const svg = createSvg(VIEW_W, VIEW_H);
	svg.style.height = height;
	svg.style.width = '100%';
	svg.classList.add('pt-sparkline');

	const min = Math.min(...values);
	const max = Math.max(...values, min + 0.01);
	const range = max - min;
	const xStep = (plotRight - PAD) / (values.length - 1);

	// Build polyline points
	const pts: [number, number][] = [];
	for (let i = 0; i < values.length; i++) {
		const x = PAD + i * xStep;
		const y = PAD + ((max - values[i]) / range) * (VIEW_H - PAD * 2);
		pts.push([x, y]);
	}
	const pointStr = pts.map(([x, y]) => `${x},${y}`).join(' ');

	// Gradient fill under line
	if (showArea) {
		const gradId = `pt-spark-grad-${Math.random().toString(36).slice(2, 8)}`;
		const defs = svgEl('defs', {}, svg);
		const grad = svgEl('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
		svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.25 }, grad);
		svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0.02 }, grad);

		const areaPoints = [
			`${PAD},${VIEW_H - PAD}`,
			...pts.map(([x, y]) => `${x},${y}`),
			`${pts[pts.length - 1][0]},${VIEW_H - PAD}`,
		].join(' ');
		svgEl('polygon', { points: areaPoints, fill: `url(#${gradId})` }, svg);
	}

	// Line
	svgEl('polyline', {
		points: pointStr,
		fill: 'none',
		stroke: color,
		'stroke-width': 0.8,
		'stroke-linejoin': 'round',
		'stroke-linecap': 'round',
	}, svg);

	// End dot
	const [lastX, lastY] = pts[pts.length - 1];
	svgEl('circle', { cx: lastX, cy: lastY, r: 1.2, fill: color }, svg);

	// Value labels on right side
	if (hasLabels) {
		const latest = values[values.length - 1];
		const labelX = plotRight + 2;

		// Latest value (at the end dot's Y position)
		svgEl('text', {
			x: labelX, y: lastY + 1,
			'font-size': 2.8, fill: color, 'font-weight': '600',
		}, svg).textContent = formatValue(latest);

		// Max label (top)
		if (Math.abs(max - latest) / range > 0.15) {
			svgEl('text', {
				x: labelX, y: PAD + 2,
				'font-size': 2.4, fill: 'var(--text-faint)',
			}, svg).textContent = formatValue(max);
		}

		// Min label (bottom)
		if (Math.abs(latest - min) / range > 0.15) {
			svgEl('text', {
				x: labelX, y: VIEW_H - PAD,
				'font-size': 2.4, fill: 'var(--text-faint)',
			}, svg).textContent = formatValue(min);
		}
	}

	parent.appendChild(svg);
}
