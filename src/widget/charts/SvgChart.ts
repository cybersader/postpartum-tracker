/**
 * Base SVG chart utilities. Zero dependencies — all charts built from
 * raw SVG elements using document.createElementNS.
 */

const NS = 'http://www.w3.org/2000/svg';

/** Create a root <svg> element with viewBox for responsive scaling. */
export function createSvg(viewWidth: number, viewHeight: number): SVGSVGElement {
	const svg = document.createElementNS(NS, 'svg');
	svg.setAttribute('viewBox', `0 0 ${viewWidth} ${viewHeight}`);
	svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
	svg.style.width = '100%';
	svg.style.display = 'block';
	return svg;
}

/** Create any SVG child element. */
export function svgEl<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string | number> = {},
	parent?: SVGElement,
): SVGElementTagNameMap[K] {
	const el = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
	for (const [k, v] of Object.entries(attrs)) {
		el.setAttribute(k, String(v));
	}
	if (parent) parent.appendChild(el);
	return el;
}

/** Linear scale: map value from [domainMin, domainMax] to [rangeMin, rangeMax]. */
export function scale(
	value: number,
	domainMin: number,
	domainMax: number,
	rangeMin: number,
	rangeMax: number,
): number {
	if (domainMax === domainMin) return rangeMin;
	return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
}

/** Draw horizontal grid lines (dotted). */
export function drawGridLines(
	svg: SVGElement,
	plotArea: PlotArea,
	count: number,
	maxVal: number,
): void {
	for (let i = 1; i <= count; i++) {
		const y = scale(i * (maxVal / count), 0, maxVal, plotArea.bottom, plotArea.top);
		svgEl('line', {
			x1: plotArea.left, y1: y, x2: plotArea.right, y2: y,
			stroke: 'var(--background-modifier-border)',
			'stroke-width': 0.5,
			'stroke-dasharray': '2,2',
		}, svg);
	}
}

/** Draw x-axis labels. Automatically skips labels and shrinks font when crowded. */
export function drawXLabels(
	svg: SVGElement,
	labels: string[],
	plotArea: PlotArea,
	y: number,
): void {
	const n = labels.length;
	const step = (plotArea.right - plotArea.left) / n;
	// Adaptive label skipping: show ~8-12 labels max
	const skip = n <= 10 ? 1 : n <= 20 ? 2 : n <= 40 ? 5 : 7;
	const fontSize = n > 14 ? 2.2 : n > 10 ? 2.4 : 3;
	for (let i = 0; i < n; i++) {
		const isEdge = i === 0 || i === n - 1;
		if (!isEdge && i % skip !== 0) continue;
		svgEl('text', {
			x: plotArea.left + step * i + step / 2,
			y,
			'text-anchor': 'middle',
			'font-size': fontSize,
			fill: 'var(--text-muted)',
		}, svg).textContent = labels[i];
	}
}

/** Draw y-axis labels. */
export function drawYLabels(
	svg: SVGElement,
	values: number[],
	plotArea: PlotArea,
	maxVal: number,
): void {
	for (const v of values) {
		const y = scale(v, 0, maxVal, plotArea.bottom, plotArea.top);
		svgEl('text', {
			x: plotArea.left - 1,
			y: y + 1,
			'text-anchor': 'end',
			'font-size': 2.8,
			fill: 'var(--text-muted)',
		}, svg).textContent = String(v);
	}
}

/** Plot area boundaries within a viewBox. */
export interface PlotArea {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/** Standard plot area with margins for labels. */
export function defaultPlotArea(viewWidth: number, viewHeight: number): PlotArea {
	return {
		top: 3,
		right: viewWidth - 2,
		bottom: viewHeight - 5,
		left: 8,
	};
}

/** Compute a simple moving average. */
export function movingAverage(data: number[], window: number): (number | null)[] {
	return data.map((_, i) => {
		if (i < window - 1) return null;
		let sum = 0;
		for (let j = i - window + 1; j <= i; j++) sum += data[j];
		return sum / window;
	});
}

/** Get short day labels for the last N days ("Mon", "Tue", etc.). */
export function dayLabels(days: number): string[] {
	const labels: string[] = [];
	const now = new Date();
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		if (i === 0) {
			labels.push('Today');
		} else if (days <= 7) {
			// Short day names for 1-week view
			labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
		} else {
			// M/D format for 2w+ to avoid repeating day names
			labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
		}
	}
	return labels;
}

/** Get date keys (YYYY-MM-DD) for the last N days. */
export function dateKeys(days: number): string[] {
	const keys: string[] = [];
	const now = new Date();
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
	}
	return keys;
}

/** Assign an entry to a date key (YYYY-MM-DD) using local time. */
export function toDateKey(iso: string): string {
	const d = new Date(iso);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Compute trend direction from last few values. */
export function trendDirection(values: number[]): 'up' | 'down' | 'stable' {
	if (values.length < 3) return 'stable';
	const recent = values.slice(-3);
	const older = values.slice(-6, -3);
	if (older.length === 0) return 'stable';
	const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
	const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
	const diff = (recentAvg - olderAvg) / (olderAvg || 1);
	if (diff > 0.1) return 'up';
	if (diff < -0.1) return 'down';
	return 'stable';
}

export const TREND_ARROWS: Record<string, string> = {
	up: '\u2197',    // ↗
	down: '\u2198',  // ↘
	stable: '\u2192', // →
};

/**
 * Aggregate daily BarDatum arrays into weekly buckets.
 * Returns { data, labels } with one bar per week showing the weekly average.
 */
export function aggregateWeekly(
	dailyValues: number[],
	dailyLabels: string[],
): { values: number[]; labels: string[] } {
	const weeks: { sum: number; activeDays: number; label: string }[] = [];
	for (let i = 0; i < dailyValues.length; i += 7) {
		const chunk = dailyValues.slice(i, i + 7);
		const sum = chunk.reduce((a, b) => a + b, 0);
		const activeDays = chunk.filter(v => v > 0).length;
		const weekNum = Math.floor(i / 7) + 1;
		weeks.push({ sum, activeDays, label: `W${weekNum}` });
	}
	return {
		values: weeks.map(w => w.activeDays > 0
			? Math.round((w.sum / w.activeDays) * 10) / 10
			: 0),
		labels: weeks.map(w => w.label),
	};
}

/** Day-of-week labels. */
export const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Collapse a daily heatmap grid into weekly rows (W1, W2, ...).
 * Each row is the average hour profile across that 7-day chunk.
 */
export function collapseToWeeks(
	dailyGrid: number[][],
): { grid: number[][]; labels: string[] } {
	const grid: number[][] = [];
	const labels: string[] = [];
	for (let i = 0; i < dailyGrid.length; i += 7) {
		const chunk = dailyGrid.slice(i, i + 7);
		// Only count days that have any data
		const activeDays = chunk.filter(row => row.some(v => v > 0)).length;
		if (activeDays === 0) {
			// Still push the row (heatmap will filter it out), keeps label alignment
			grid.push(new Array(24).fill(0));
			labels.push(`W${Math.floor(i / 7) + 1}`);
			continue;
		}
		const avgRow = new Array<number>(24).fill(0);
		for (const row of chunk) {
			for (let h = 0; h < 24 && h < row.length; h++) {
				avgRow[h] += row[h];
			}
		}
		for (let h = 0; h < 24; h++) avgRow[h] /= activeDays;
		grid.push(avgRow);
		labels.push(`W${Math.floor(i / 7) + 1}`);
	}
	return { grid, labels };
}

/**
 * Collapse a daily heatmap grid into a 7-row day-of-week average grid.
 * Returns { grid, labels } with Mon-Sun rows, each being the average
 * hour profile for that weekday.
 */
export function collapseToWeekdays(
	dailyGrid: number[][],
	keys: string[],
): { grid: number[][]; labels: string[] } {
	// 7 weekday buckets, each with 24 hour accumulators + count
	const buckets: { hours: number[]; count: number }[] = Array.from({ length: 7 }, () => ({
		hours: new Array(24).fill(0),
		count: 0,
	}));

	for (let i = 0; i < dailyGrid.length && i < keys.length; i++) {
		const d = new Date(keys[i] + 'T12:00:00'); // noon to avoid TZ issues
		const dow = (d.getDay() + 6) % 7; // 0=Mon, 6=Sun
		buckets[dow].count++;
		for (let h = 0; h < 24 && h < dailyGrid[i].length; h++) {
			buckets[dow].hours[h] += dailyGrid[i][h];
		}
	}

	// Average each bucket
	const grid = buckets.map(b => {
		if (b.count === 0) return new Array(24).fill(0);
		return b.hours.map(v => v / b.count);
	});

	return { grid, labels: DOW_LABELS };
}
