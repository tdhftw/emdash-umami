// Loaded lazily (see OverviewView) so ECharts is only downloaded on the Analytics page.
// Keep this module's imports limited to ECharts and Kumo's chart: importing a module that the
// eagerly loaded admin code also uses lets the bundler pull ECharts into that shared chunk.
// Kumo's TimeseriesChart always stacks bars and uses a time axis with ticks in the browser's zone,
// so this uses the low-level Chart with options from chartOptions.ts.
import { Chart as KumoChart, ChartPalette } from "@cloudflare/kumo/components/chart";
import { BarChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import type { Overview } from "../shared/stats.js";
import { chartOptions } from "./chartOptions.js";

echarts.use([BarChart, AriaComponent, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export default function Chart({ overview, dark }: { overview: Overview; dark: boolean }) {
	const options = chartOptions(overview, {
		pageviews: ChartPalette.categorical(0, dark),
		visitors: ChartPalette.categorical(4, dark),
	});
	return <KumoChart echarts={echarts} options={options} isDarkMode={dark} height={260} optionUpdateBehavior={{ notMerge: true }} />;
}
