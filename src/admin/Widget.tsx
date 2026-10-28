import { Loader } from "@cloudflare/kumo";

import type { Overview } from "../shared/stats.js";
import { change, formatNumber } from "./format.js";
import { useActive, useOverview } from "./hooks.js";

/** Tiny dependency-free sparkline, so the dashboard never loads the charting library. */
function Sparkline({ values }: { values: number[] }) {
	const w = 240;
	const h = 40;
	const max = Math.max(1, ...values);
	const step = values.length > 1 ? w / (values.length - 1) : w;
	const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`).join(" ");
	return (
		<svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden>
			<polyline points={points} fill="none" stroke="var(--color-kumo-brand)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
		</svg>
	);
}

function Stat({ label, value, previous }: { label: string; value: number; previous: number }) {
	const c = change(value, previous);
	const pct = c === null ? null : Math.round(c * 100);
	return (
		<div>
			<div className="text-xs text-kumo-subtle">{label}</div>
			<div className="text-xl font-semibold tabular-nums">{formatNumber(value)}</div>
			{pct !== null && pct !== 0 ? (
				<div className={`text-xs tabular-nums ${pct > 0 ? "text-kumo-success" : "text-kumo-danger"}`}>
					{pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%
				</div>
			) : null}
		</div>
	);
}

function Summary({ overview }: { overview: Overview }) {
	const active = useActive();
	return (
		<div className="space-y-3">
			<div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
				<Stat label="Visitors" value={overview.totals.visitors} previous={overview.previous.visitors} />
				<Stat label="Pageviews" value={overview.totals.pageviews} previous={overview.previous.pageviews} />
				<div>
					<div className="text-xs text-kumo-subtle">Active now</div>
					<div className="text-xl font-semibold tabular-nums">{active.data ? active.data.visitors : "–"}</div>
				</div>
			</div>
			<Sparkline values={overview.series.map((p) => p.visitors)} />
			<div className="flex items-center justify-between text-xs text-kumo-subtle">
				<span>Visitors, last 7 days</span>
				<a href={`/_emdash/admin/plugins/umami/`} className="underline">
					Open Analytics
				</a>
			</div>
		</div>
	);
}

export function OverviewWidget() {
	const overview = useOverview("7d");
	if (overview.data) return <Summary overview={overview.data} />;
	if (overview.error) {
		return (
			<p className="text-sm text-kumo-subtle">
				{(overview.error as Error).message}{" "}
				<a href="/_emdash/admin/plugins/umami/#settings" className="underline">
					Settings
				</a>
			</p>
		);
	}
	return <Loader />;
}

