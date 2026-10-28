import { METRIC_TYPES, type Active, type MetricRow, type MetricType, type Overview, type Range, type SeriesPoint, type Totals } from "../shared/stats.js";
import type { UmamiClient } from "./client.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface Window {
	range: Range;
	unit: "hour" | "day";
	startAt: number;
	endAt: number;
}

/** Rolling windows ending now; hours for the last day, days otherwise. */
export function windowFor(range: Range, now: number): Window {
	const days = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }[range];
	const unit = range === "24h" ? "hour" : "day";
	return { range, unit, startAt: now - days * DAY + 1, endAt: now };
}

export function isValidTimeZone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

function num(value: unknown): number {
	const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
	return Number.isFinite(n) ? n : 0;
}

export function toTotals(raw: unknown): Totals {
	const r = (raw ?? {}) as Record<string, unknown>;
	return {
		pageviews: num(r.pageviews),
		visitors: num(r.visitors),
		visits: num(r.visits),
		bounces: num(r.bounces),
		totaltime: num(r.totaltime),
	};
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
	let f = formatters.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat("en-CA", {
			timeZone: tz,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			hourCycle: "h23",
		});
		formatters.set(tz, f);
	}
	return f;
}

/** Wall-clock parts of an instant in a time zone. */
function partsIn(t: number, tz: string) {
	const parts = Object.fromEntries(
		formatter(tz)
			.formatToParts(new Date(t))
			.map((p) => [p.type, p.value]),
	);
	return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parts.hour as string };
}

export function bucketLabel(t: number, unit: "hour" | "day", tz: string): string {
	const p = partsIn(t, tz);
	return unit === "day" ? p.date : `${p.date} ${p.hour}:00`;
}

/**
 * Umami returns buckets as wall-clock strings in the requested zone ("2026-09-28 14:00:00", or an
 * ISO-like variant) and omits empty ones. Normalize to our label format.
 */
export function labelFromUmami(x: string, unit: "hour" | "day"): string {
	const clean = x.replace("T", " ");
	return unit === "day" ? clean.slice(0, 10) : `${clean.slice(0, 13)}:00`;
}

/** Every bucket in the window, oldest first, so charts show zero days instead of skipping them. */
export function buckets(win: Window, tz: string): Array<{ label: string; t: number }> {
	// Walk hourly even for day buckets: DST makes local days 23 to 25 hours long.
	const step = HOUR;
	const seen = new Map<string, number>();
	// Start on an hour boundary so each bucket's `t` is its start (exact for whole-hour zones).
	for (let t = Math.floor(win.startAt / HOUR) * HOUR; t <= win.endAt; t += step) {
		const label = bucketLabel(t, win.unit, tz);
		if (!seen.has(label)) seen.set(label, t);
	}
	const end = bucketLabel(win.endAt, win.unit, tz);
	if (!seen.has(end)) seen.set(end, win.endAt);
	return [...seen.entries()].map(([label, t]) => ({ label, t }));
}

type XY = Array<{ x?: unknown; y?: unknown }>;

export function mergeSeries(win: Window, tz: string, pageviews: XY, sessions: XY): SeriesPoint[] {
	const index = (rows: XY) => {
		const m = new Map<string, number>();
		for (const row of rows ?? []) {
			if (typeof row.x !== "string") continue;
			const key = labelFromUmami(row.x, win.unit);
			m.set(key, (m.get(key) ?? 0) + num(row.y));
		}
		return m;
	};
	const pv = index(pageviews);
	const vis = index(sessions);
	return buckets(win, tz).map(({ label, t }) => ({ label, t, pageviews: pv.get(label) ?? 0, visitors: vis.get(label) ?? 0 }));
}

export function toRows(raw: unknown, limit: number): MetricRow[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((row: { x?: unknown; y?: unknown }) => ({
			label: row.x == null || row.x === "" ? "(none)" : String(row.x),
			value: num(row.y),
		}))
		.filter((row) => row.value > 0)
		.slice(0, limit);
}

const TOP_LIMIT = 10;

export async function fetchOverview(client: UmamiClient, websiteId: string, range: Range, timezone: string, now = Date.now()): Promise<Overview> {
	const win = windowFor(range, now);
	const id = encodeURIComponent(websiteId);
	const q = { startAt: win.startAt, endAt: win.endAt, timezone };
	const length = win.endAt - win.startAt;

	const [stats, prev, series, ...metrics] = await Promise.all([
		client.get<unknown>(`/websites/${id}/stats`, q, "the summary"),
		client.get<unknown>(`/websites/${id}/stats`, { ...q, startAt: win.startAt - length - 1, endAt: win.startAt - 1 }, "the previous period"),
		client.get<{ pageviews?: XY; sessions?: XY }>(`/websites/${id}/pageviews`, { ...q, unit: win.unit }, "the chart"),
		...METRIC_TYPES.map((type) => client.get<unknown>(`/websites/${id}/metrics`, { ...q, type, limit: TOP_LIMIT }, `the top ${type} list`)),
	]);

	return {
		websiteId,
		range,
		unit: win.unit,
		timezone,
		startAt: win.startAt,
		endAt: win.endAt,
		totals: toTotals(stats),
		previous: toTotals(prev),
		series: mergeSeries(win, timezone, series.pageviews ?? [], series.sessions ?? []),
		top: Object.fromEntries(METRIC_TYPES.map((type, i) => [type, toRows(metrics[i], TOP_LIMIT)])) as Record<MetricType, MetricRow[]>,
		fetchedAt: now,
		stale: false,
	};
}

export async function fetchActive(client: UmamiClient, websiteId: string, now = Date.now()): Promise<Active> {
	const raw = await client.get<{ visitors?: unknown } | null>(`/websites/${encodeURIComponent(websiteId)}/active`, {}, "active visitors");
	return { visitors: num(raw?.visitors), fetchedAt: now };
}
