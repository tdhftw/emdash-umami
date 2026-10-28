import { Badge, Banner, Button, Loader, Surface, Tabs } from "@cloudflare/kumo";
import * as React from "react";

import { METRIC_TYPES, RANGES, type MetricRow, type MetricType, type Overview, type Range } from "../shared/stats.js";
import { METRIC_TITLES, RANGE_LABELS, change, kpis, metricLabel, relativeTime, type Kpi } from "./format.js";
import { useActive, useDarkMode, useOverview, useRange } from "./hooks.js";

const Chart = React.lazy(() => import("./Chart.js"));

function Delta({ kpi }: { kpi: Kpi }) {
	const c = change(kpi.value, kpi.previous);
	if (c === null || !Number.isFinite(c)) return <span className="text-xs text-kumo-subtle">no earlier data</span>;
	const rounded = Math.round(c * 100);
	if (rounded === 0) return <span className="text-xs text-kumo-subtle">no change</span>;
	const good = kpi.lowerIsBetter ? rounded < 0 : rounded > 0;
	return (
		<span className={`text-xs tabular-nums ${good ? "text-kumo-success" : "text-kumo-danger"}`}>
			{rounded > 0 ? "▲" : "▼"} {Math.abs(rounded)}%
		</span>
	);
}

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
	return (
		<Surface className="rounded-lg p-4">
			<div className="text-sm text-kumo-subtle">{label}</div>
			<div className="text-2xl font-semibold tabular-nums">{value}</div>
			<div>{children}</div>
		</Surface>
	);
}

function ActiveTile() {
	const active = useActive();
	return (
		<Tile label="Active now" value={active.data ? String(active.data.visitors) : active.isError ? "–" : "…"}>
			<span className="text-xs text-kumo-subtle">last 5 minutes</span>
		</Tile>
	);
}

function TopList({ type, rows }: { type: MetricType; rows: MetricRow[] }) {
	const max = rows[0]?.value ?? 0;
	return (
		<Surface className="rounded-lg p-4">
			<div className="flex items-center justify-between">
				<h3 className="font-semibold">{METRIC_TITLES[type]}</h3>
				<span className="text-xs text-kumo-subtle">{type === "event" ? "Events" : "Visitors"}</span>
			</div>
			{rows.length === 0 ? (
				<p className="text-sm text-kumo-subtle" style={{ marginTop: 12 }}>
					{type === "event" ? "No custom events in this period." : "Nothing recorded in this period."}
				</p>
			) : (
				<ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 4 }}>
					{rows.map((row) => (
						<li key={row.label} style={{ position: "relative", padding: "4px 8px", borderRadius: 6, overflow: "hidden" }}>
							<div
								aria-hidden
								style={{
									position: "absolute",
									inset: 0,
									width: `${max > 0 ? (row.value / max) * 100 : 0}%`,
									background: "var(--color-kumo-tint)",
								}}
							/>
							<div className="flex items-center justify-between gap-3 text-sm" style={{ position: "relative" }}>
								<span className="truncate" title={row.label}>
									{metricLabel(type, row.label)}
								</span>
								<span className="tabular-nums">{row.value.toLocaleString()}</span>
							</div>
						</li>
					))}
				</ol>
			)}
		</Surface>
	);
}

function Body({ overview }: { overview: Overview }) {
	const dark = useDarkMode();
	return (
		<>
			<div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
				{kpis(overview.totals, overview.previous).map((kpi) => (
					<Tile key={kpi.key} label={kpi.label} value={kpi.format(kpi.value)}>
						<Delta kpi={kpi} />
					</Tile>
				))}
				<ActiveTile />
			</div>
			<Surface className="rounded-lg p-4">
				<React.Suspense fallback={<div style={{ height: 260 }} />}>
					<Chart overview={overview} dark={dark} />
				</React.Suspense>
			</Surface>
			<div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
				{METRIC_TYPES.map((type) => (
					<TopList key={type} type={type} rows={overview.top[type]} />
				))}
			</div>
		</>
	);
}

export function OverviewView({ onOpenSettings }: { onOpenSettings: () => void }) {
	const [range, setRange] = useRange();
	const overview = useOverview(range);
	const error = overview.error as (Error & { code?: string }) | null;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Tabs
					variant="segmented"
					size="sm"
					value={range}
					onValueChange={(value) => setRange(value as Range)}
					tabs={RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
				/>
				<div className="flex items-center gap-3 text-xs text-kumo-subtle">
					{overview.data?.stale ? <Badge variant="orange">Umami unreachable, showing saved data</Badge> : null}
					{overview.data ? <span>Updated {relativeTime(overview.data.fetchedAt)}</span> : null}
					{overview.isFetching ? <Loader size="sm" /> : null}
				</div>
			</div>
			{error && !overview.data ? (
				<Banner
					variant="error"
					title="Could not load statistics"
					description={
						<>
							{error.message}{" "}
							{error.code === "not-configured" || error.code === "unauthorized" || error.code === "not-found" ? (
								<Button type="button" size="sm" variant="secondary" onClick={onOpenSettings}>
									Open settings
								</Button>
							) : null}
						</>
					}
				/>
			) : overview.data ? (
				<Body overview={overview.data} />
			) : (
				<Loader />
			)}
		</div>
	);
}
