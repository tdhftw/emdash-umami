// Kept free of ECharts and Kumo imports so it can be unit-tested and stays out of shared chunks.
import type { Overview } from "../shared/stats.js";

const dayLabel = new Intl.DateTimeFormat(undefined, { timeZone: "UTC", day: "numeric", month: "short" });

/**
 * Axis label for a series bucket. Bucket labels are already in the site's zone ("2026-10-21" or
 * "2026-10-21 14:00"), so they are reformatted as text rather than from `t`, which a time axis
 * would place in the browser's zone.
 */
export function bucketLabel(label: string, unit: Overview["unit"]): string {
	if (unit === "hour") return label.slice(11, 16);
	const [y, m, d] = label.split("-").map(Number);
	return dayLabel.format(Date.UTC(y!, m! - 1, d!));
}

/**
 * ECharts options for the Overview chart. A category axis with one bar slot per bucket, and the
 * two series drawn over each other (`barGap: "-100%"`) rather than stacked: visitors never exceed
 * pageviews, so each bar's height is its real count, as in Umami's own chart.
 */
export function chartOptions(overview: Overview, colors: { pageviews: string; visitors: string }) {
	const series = (name: string, color: string, values: number[]) => ({
		type: "bar" as const,
		name,
		color,
		data: values,
		barGap: "-100%",
		barMaxWidth: 24,
		emphasis: { focus: "series" as const },
	});
	return {
		aria: { enabled: true, label: { description: `Pageviews and visitors per ${overview.unit}` } },
		backgroundColor: "transparent",
		legend: { top: 0, right: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10 },
		tooltip: { trigger: "axis" as const, axisPointer: { type: "shadow" as const } },
		grid: { left: 8, right: 8, top: 32, bottom: 0, containLabel: true },
		xAxis: {
			type: "category" as const,
			data: overview.series.map((p) => bucketLabel(p.label, overview.unit)),
			axisTick: { alignWithLabel: true },
			axisLabel: { hideOverlap: true },
		},
		yAxis: {
			type: "value" as const,
			minInterval: 1,
			splitLine: { lineStyle: { type: "dashed" as const } },
		},
		series: [
			series("Pageviews", colors.pageviews, overview.series.map((p) => p.pageviews)),
			series("Visitors", colors.visitors, overview.series.map((p) => p.visitors)),
		],
	};
}
