import * as echarts from "echarts";
import { describe, expect, it } from "vitest";

import { bucketLabel, chartOptions } from "../src/admin/chartOptions.js";
import type { Overview } from "../src/shared/stats.js";

const colors = { pageviews: "#111111", visitors: "#222222" };

function overview(unit: Overview["unit"], labels: string[], values: (i: number) => [number, number]): Overview {
	return {
		unit,
		timezone: "Europe/Stockholm",
		series: labels.map((label, i) => {
			const [pageviews, visitors] = values(i);
			return { label, t: 0, pageviews, visitors };
		}),
	} as unknown as Overview;
}

const days = (n: number) =>
	Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 6, 30) + i * 86_400_000).toISOString().slice(0, 10));

/** Renders server-side and returns the text of every SVG label. */
function renderedText(options: ReturnType<typeof chartOptions>): string[] {
	const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 900, height: 260 });
	chart.setOption({ ...options, animation: false });
	const svg = chart.renderToSVGString();
	chart.dispose();
	return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!);
}

describe("bucketLabel", () => {
	it("formats day and hour buckets from the site-zone label", () => {
		expect(bucketLabel("2026-10-21 14:00", "hour")).toBe("14:00");
		expect(bucketLabel("2026-10-21", "day")).toMatch(/21/);
		expect(bucketLabel("2026-10-01", "day")).not.toMatch(/30/);
	});
});

describe("chartOptions", () => {
	it("overlaps the series instead of stacking them", () => {
		const o = chartOptions(overview("day", days(7), () => [99, 12]), colors);
		for (const s of o.series) {
			expect(s).not.toHaveProperty("stack");
			expect(s.barGap).toBe("-100%");
		}
		expect(o.series[0]!.data).toEqual(Array(7).fill(99));
		expect(o.series[1]!.data).toEqual(Array(7).fill(12));
	});

	it("labels the y axis in whole numbers when there is no data", () => {
		const hours = Array.from({ length: 25 }, (_, i) => `2026-10-27 ${String(i % 24).padStart(2, "0")}:00`);
		const text = renderedText(chartOptions(overview("hour", hours, () => [0, 0]), colors));
		const numbers = text.filter((t) => /^\d+$/.test(t));
		expect(numbers.length).toBeGreaterThan(0);
		expect(new Set(numbers).size).toBe(numbers.length);
	});

	it("shows each 90-day x label once, in order", () => {
		const labels = days(91);
		const text = renderedText(chartOptions(overview("day", labels, (i) => [i, 0]), colors));
		const all = labels.map((l) => bucketLabel(l, "day"));
		const shown = text.filter((t) => all.includes(t));
		expect(shown.length).toBeGreaterThan(3);
		expect(new Set(shown).size).toBe(shown.length);
		const positions = shown.map((t) => all.indexOf(t));
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
	});
});
