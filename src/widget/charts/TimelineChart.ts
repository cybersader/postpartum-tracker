/**
 * Horizontal 24-hour timeline chart showing events across the day.
 * Multiple rows for multiple days, newest at top.
 */
import { createSvg, svgEl } from './SvgChart';

export interface TimelineBlock {
	/** Start hour (0-24 decimal, e.g. 14.5 = 2:30 PM). */
	startHour: number;
	/** End hour. If omitted, renders as a dot. */
	endHour?: number;
	color: string;
	label?: string;
}

export interface TimelineRow {
	dayLabel: string;
	blocks: TimelineBlock[];
}

export interface TimelineBand {
	startHour: number;
	endHour: number;
	color: string;
	opacity?: number;
}

export interface TimelineChartOptions {
	height?: string;
	showCurrentTime?: boolean;
	/** Semi-transparent background bands (e.g. parent sleep window). */
	backgroundBands?: TimelineBand[];
}

const VIEW_W = 100;
const ROW_H = 6;
const LABEL_W = 12;
const PLOT_LEFT = LABEL_W + 1;
const PLOT_RIGHT = VIEW_W - 1;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const HEADER_H = 4;

export function renderTimelineChart(
	parent: HTMLElement,
	rows: TimelineRow[],
	opts: TimelineChartOptions = {},
): void {
	if (rows.length === 0) return;

	const { showCurrentTime = true } = opts;
	const viewH = HEADER_H + rows.length * ROW_H + 2;
	const svg = createSvg(VIEW_W, viewH);
	svg.classList.add('pt-timeline-chart');
	// No fixed height — viewBox ratio scales with container width

	// Hour labels (0, 6, 12, 18, 24)
	const hours = [0, 6, 12, 18, 24];
	for (const h of hours) {
		const x = PLOT_LEFT + (h / 24) * PLOT_W;
		const label = h === 0 ? '12a' : h === 6 ? '6a' : h === 12 ? '12p' : h === 18 ? '6p' : '12a';
		svgEl('text', {
			x, y: HEADER_H - 0.5,
			'text-anchor': 'middle', 'font-size': 2.5,
			fill: 'var(--text-muted)',
		}, svg).textContent = label;

		// Vertical grid line
		svgEl('line', {
			x1: x, y1: HEADER_H, x2: x, y2: HEADER_H + rows.length * ROW_H,
			stroke: 'var(--background-modifier-border)',
			'stroke-width': 0.3,
		}, svg);
	}

	// Rows
	for (let r = 0; r < rows.length; r++) {
		const row = rows[r];
		const y = HEADER_H + r * ROW_H;

		// Day label
		svgEl('text', {
			x: LABEL_W, y: y + ROW_H / 2 + 1,
			'text-anchor': 'end', 'font-size': 2.5,
			fill: 'var(--text-muted)',
		}, svg).textContent = row.dayLabel;

		// Row background
		svgEl('rect', {
			x: PLOT_LEFT, y: y + 0.5, width: PLOT_W, height: ROW_H - 1,
			fill: 'var(--background-secondary)',
			rx: 1,
		}, svg);

		// Background bands (e.g. parent sleep window)
		if (opts.backgroundBands) {
			for (const band of opts.backgroundBands) {
				const op = band.opacity ?? 0.08;
				if (band.startHour <= band.endHour) {
					// Same-day band
					const bx1 = PLOT_LEFT + (band.startHour / 24) * PLOT_W;
					const bx2 = PLOT_LEFT + (band.endHour / 24) * PLOT_W;
					svgEl('rect', {
						x: bx1, y: y + 0.5, width: bx2 - bx1, height: ROW_H - 1,
						fill: band.color, opacity: op, rx: 1,
					}, svg);
				} else {
					// Wraps midnight: draw two segments
					const bx1 = PLOT_LEFT + (band.startHour / 24) * PLOT_W;
					svgEl('rect', {
						x: bx1, y: y + 0.5, width: PLOT_RIGHT - bx1, height: ROW_H - 1,
						fill: band.color, opacity: op, rx: 1,
					}, svg);
					const bx2 = PLOT_LEFT + (band.endHour / 24) * PLOT_W;
					svgEl('rect', {
						x: PLOT_LEFT, y: y + 0.5, width: bx2 - PLOT_LEFT, height: ROW_H - 1,
						fill: band.color, opacity: op, rx: 1,
					}, svg);
				}
			}
		}

		// Blocks
		for (const block of row.blocks) {
			const x1 = PLOT_LEFT + (block.startHour / 24) * PLOT_W;
			if (block.endHour != null) {
				const x2 = PLOT_LEFT + (block.endHour / 24) * PLOT_W;
				const w = Math.max(x2 - x1, 0.5);
				svgEl('rect', {
					x: x1, y: y + 1, width: w, height: ROW_H - 2,
					fill: block.color, rx: 0.5, opacity: 0.85,
				}, svg);
			} else {
				// Point event — dot
				svgEl('circle', {
					cx: x1, cy: y + ROW_H / 2, r: 1,
					fill: block.color,
				}, svg);
			}
		}
	}

	// Current time marker
	if (showCurrentTime) {
		const now = new Date();
		const currentHour = now.getHours() + now.getMinutes() / 60;
		const x = PLOT_LEFT + (currentHour / 24) * PLOT_W;
		svgEl('line', {
			x1: x, y1: HEADER_H - 0.5,
			x2: x, y2: HEADER_H + rows.length * ROW_H,
			stroke: 'var(--text-error)',
			'stroke-width': 0.4,
		}, svg);
	}

	parent.appendChild(svg);
}
