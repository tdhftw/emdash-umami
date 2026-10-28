/** Stats shapes shared by the server routes and the admin UI. */

export const RANGES = ["24h", "7d", "30d", "90d"] as const;
export type Range = (typeof RANGES)[number];

export const METRIC_TYPES = ["path", "referrer", "country", "browser", "os", "device", "event"] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export interface Totals {
	pageviews: number;
	visitors: number;
	visits: number;
	bounces: number;
	/** Total visit duration in seconds. */
	totaltime: number;
}

export interface SeriesPoint {
	/** Bucket start as a wall-clock label in the requested time zone: "2026-09-28" or "2026-09-28 14:00". */
	label: string;
	/** Bucket start as epoch milliseconds (UTC instant), for charting. */
	t: number;
	pageviews: number;
	visitors: number;
}

export interface MetricRow {
	label: string;
	value: number;
}

export interface Overview {
	websiteId: string;
	range: Range;
	unit: "hour" | "day";
	timezone: string;
	startAt: number;
	endAt: number;
	totals: Totals;
	/** Same-length period immediately before this one. */
	previous: Totals;
	series: SeriesPoint[];
	top: Record<MetricType, MetricRow[]>;
	fetchedAt: number;
	/** True when Umami could not be reached and this is an older cached copy. */
	stale: boolean;
}

export interface Active {
	visitors: number;
	fetchedAt: number;
}
