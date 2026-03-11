/**
 * 24-hour heatmap chart showing activity density by hour across days.
 * Rows = days (newest at top), columns = hours (0-23).
 */
import { createSvg, svgEl } from './SvgChart';

export interface HeatmapOptions {
	/** CSS color variable for max intensity. Default: '--interactive-accent'. */
	color?: string;
	height?: string;
	/** Show gradient legend bar below chart. Default: true. */
	showLegend?: boolean;
	/** Show an averaged summary row at bottom. Default: false. */
	showAvgRow?: boolean;
	/** Format a cell value for the legend scale. Default: rounds to 1 decimal. */
	formatValue?: (v: number) => string;
	/** Format row daily total shown on right. If provided, shows daily avg per row. */
	formatRowTotal?: (total: number) => string;
}

const VIEW_W = 100;
const LABEL_W = 12;
const HEADER_H = 4;
const ROW_H = 5;
const ROW_TOTAL_W = 14; // space for daily avg on right
const PLOT_LEFT = LABEL_W + 1;
const PLOT_RIGHT = VIEW_W - ROW_TOTAL_W;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const COLS = 24;
const COL_W = PLOT_W / COLS;
const CELL_PAD = 0.3;

/** Hour labels shown at top (every 3 hours). */
const HOUR_LABELS: [number, string][] = [
	[0, '12a'], [3, '3a'], [6, '6a'], [9, '9a'],
	[12, '12p'], [15, '3p'], [18, '6p'], [21, '9p'],
];

export function renderHeatmapChart(
	parent: HTMLElement,
	/** grid[rowIndex][hourIndex] = value. Rows ordered oldest→newest. */
	grid: number[][],
	dayLabels: string[],
	opts: HeatmapOptions = {},
): void {
	if (grid.length === 0) return;

	const color = opts.color ?? 'var(--interactive-accent)';
	const showLegend = opts.showLegend ?? true;
	const showAvgRow = opts.showAvgRow ?? false;
	const fmt = opts.formatValue ?? ((v: number) => String(Math.round(v * 10) / 10));
	const fmtRow = opts.formatRowTotal ?? null;

	// Find max value for opacity scaling
	let maxVal = 0;
	for (const row of grid) {
		for (const v of row) {
			if (v > maxVal) maxVal = v;
		}
	}
	if (maxVal === 0) maxVal = 1; // avoid div-by-zero

	// Compute average row if needed
	const avgRow = new Array<number>(COLS).fill(0);
	if (showAvgRow && grid.length > 0) {
		for (const row of grid) {
			for (let h = 0; h < COLS && h < row.length; h++) {
				avgRow[h] += row[h];
			}
		}
		for (let h = 0; h < COLS; h++) avgRow[h] /= grid.length;
	}

	const GAP_H = showAvgRow ? 2 : 0; // gap before avg row
	const AVG_ROW_H = showAvgRow ? ROW_H + 1 : 0;
	const viewH = HEADER_H + grid.length * ROW_H + GAP_H + AVG_ROW_H + 2;
	const svg = createSvg(VIEW_W, viewH);
	svg.classList.add('pt-heatmap-chart');
	// No fixed height — viewBox ratio scales with container width

	// Hour labels at top
	for (const [h, label] of HOUR_LABELS) {
		const x = PLOT_LEFT + (h + 0.5) * COL_W;
		svgEl('text', {
			x, y: HEADER_H - 0.5,
			'text-anchor': 'middle', 'font-size': 2.2,
			fill: 'var(--text-muted)',
		}, svg).textContent = label;
	}

	// Rows (oldest at top so newest is at bottom, matching timeline convention)
	for (let r = 0; r < grid.length; r++) {
		const row = grid[r];
		const y = HEADER_H + r * ROW_H;

		// Day label
		svgEl('text', {
			x: LABEL_W, y: y + ROW_H / 2 + 0.8,
			'text-anchor': 'end', 'font-size': 2.5,
			fill: 'var(--text-muted)',
		}, svg).textContent = dayLabels[r] ?? '';

		// Cells
		let rowSum = 0;
		for (let c = 0; c < COLS && c < row.length; c++) {
			const val = row[c];
			rowSum += val;
			const opacity = val > 0 ? 0.05 + (val / maxVal) * 0.85 : 0.03;
			const cx = PLOT_LEFT + c * COL_W + CELL_PAD;
			const cy = y + CELL_PAD;
			svgEl('rect', {
				x: cx, y: cy,
				width: COL_W - CELL_PAD * 2,
				height: ROW_H - CELL_PAD * 2,
				fill: color,
				opacity,
				rx: 0.5,
			}, svg);
		}

		// Row daily average on right
		if (fmtRow) {
			svgEl('text', {
				x: PLOT_RIGHT + 1.5, y: y + ROW_H / 2 + 0.8,
				'text-anchor': 'start', 'font-size': 2.2,
				fill: 'var(--text-muted)',
			}, svg).textContent = fmtRow(rowSum);
		}
	}

	// Average summary row
	if (showAvgRow && grid.length > 0) {
		const avgMaxVal = Math.max(...avgRow, 0.001);
		const avgY = HEADER_H + grid.length * ROW_H + GAP_H;

		// Separator line
		svgEl('line', {
			x1: PLOT_LEFT, y1: avgY - 0.5,
			x2: PLOT_RIGHT, y2: avgY - 0.5,
			stroke: 'var(--background-modifier-border)',
			'stroke-width': 0.3,
		}, svg);

		// Label
		svgEl('text', {
			x: LABEL_W, y: avgY + (AVG_ROW_H) / 2 + 0.5,
			'text-anchor': 'end', 'font-size': 2.3,
			fill: 'var(--text-accent)',
			'font-weight': 'bold',
		}, svg).textContent = 'Avg';

		// Cells with slightly larger height
		for (let c = 0; c < COLS; c++) {
			const val = avgRow[c];
			const opacity = val > 0 ? 0.1 + (val / avgMaxVal) * 0.8 : 0.03;
			svgEl('rect', {
				x: PLOT_LEFT + c * COL_W + CELL_PAD,
				y: avgY + CELL_PAD,
				width: COL_W - CELL_PAD * 2,
				height: AVG_ROW_H - CELL_PAD * 2,
				fill: color,
				opacity,
				rx: 0.5,
			}, svg);
		}

		// Avg row total on right
		if (fmtRow) {
			const avgSum = avgRow.reduce((a, b) => a + b, 0);
			svgEl('text', {
				x: PLOT_RIGHT + 1.5, y: avgY + AVG_ROW_H / 2 + 0.5,
				'text-anchor': 'start', 'font-size': 2.2,
				fill: 'var(--text-accent)',
				'font-weight': 'bold',
			}, svg).textContent = fmtRow(avgSum);
		}
	}

	parent.appendChild(svg);

	// Legend with actual values
	if (showLegend) {
		const legend = parent.createDiv({ cls: 'pt-heatmap-legend' });
		legend.createSpan({ text: fmt(0) });
		const bar = legend.createDiv({ cls: 'pt-heatmap-legend-bar' });
		bar.style.background = `linear-gradient(to right, transparent, ${color})`;
		legend.createSpan({ text: `${fmt(maxVal)}/hr` });
	}
}
