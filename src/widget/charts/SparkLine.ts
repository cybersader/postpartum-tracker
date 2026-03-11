/**
 * Inline mini sparkline — a compact trend line that fits in ~100x30px.
 * No axes, just the shape and optional gradient fill.
 */
import { createSvg, svgEl } from './SvgChart';

export interface SparkLineOptions {
	height?: string;
	color?: string;
	showArea?: boolean;
}

const VIEW_W = 50;
const VIEW_H = 16;
const PAD = 1;

export function renderSparkLine(
	parent: HTMLElement,
	values: number[],
	opts: SparkLineOptions = {},
): void {
	if (values.length < 2) return;

	const {
		height = '28px',
		color = 'var(--interactive-accent)',
		showArea = true,
	} = opts;

	const svg = createSvg(VIEW_W, VIEW_H);
	svg.style.height = height;
	svg.style.width = '100%';
	svg.classList.add('pt-sparkline');

	const min = Math.min(...values);
	const max = Math.max(...values, min + 1);
	const xStep = (VIEW_W - PAD * 2) / (values.length - 1);

	// Build polyline points
	const points: string[] = [];
	for (let i = 0; i < values.length; i++) {
		const x = PAD + i * xStep;
		const y = PAD + ((max - values[i]) / (max - min)) * (VIEW_H - PAD * 2);
		points.push(`${x},${y}`);
	}

	// Gradient fill under line
	if (showArea) {
		const gradId = `pt-spark-grad-${Math.random().toString(36).slice(2, 8)}`;
		const defs = svgEl('defs', {}, svg);
		const grad = svgEl('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
		svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.25 }, grad);
		svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0.02 }, grad);

		const areaPoints = [
			`${PAD},${VIEW_H - PAD}`,
			...points,
			`${PAD + (values.length - 1) * xStep},${VIEW_H - PAD}`,
		].join(' ');
		svgEl('polygon', {
			points: areaPoints,
			fill: `url(#${gradId})`,
		}, svg);
	}

	// Line
	svgEl('polyline', {
		points: points.join(' '),
		fill: 'none',
		stroke: color,
		'stroke-width': 0.8,
		'stroke-linejoin': 'round',
		'stroke-linecap': 'round',
	}, svg);

	// End dot
	const lastX = PAD + (values.length - 1) * xStep;
	const lastY = PAD + ((max - values[values.length - 1]) / (max - min)) * (VIEW_H - PAD * 2);
	svgEl('circle', {
		cx: lastX, cy: lastY, r: 1.2,
		fill: color,
	}, svg);

	parent.appendChild(svg);
}
