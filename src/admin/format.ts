import type { MetricType, Range, Totals } from "../shared/stats.js";

const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(n: number): string {
	return n >= 10_000 ? compact.format(n) : whole.format(n);
}

export function formatDuration(seconds: number): string {
	const s = Math.round(seconds);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
	return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function formatPercent(ratio: number): string {
	return `${Math.round(ratio * 100)}%`;
}

export interface Kpi {
	key: string;
	label: string;
	value: number;
	previous: number;
	format: (n: number) => string;
	/** Bounce rate going down is good. */
	lowerIsBetter?: boolean;
}

export function kpis(t: Totals, p: Totals): Kpi[] {
	const bounceRate = (x: Totals) => (x.visits > 0 ? Math.min(x.bounces, x.visits) / x.visits : 0);
	const avgVisit = (x: Totals) => (x.visits > 0 ? x.totaltime / x.visits : 0);
	return [
		{ key: "visitors", label: "Visitors", value: t.visitors, previous: p.visitors, format: formatNumber },
		{ key: "visits", label: "Visits", value: t.visits, previous: p.visits, format: formatNumber },
		{ key: "pageviews", label: "Pageviews", value: t.pageviews, previous: p.pageviews, format: formatNumber },
		{ key: "bounce", label: "Bounce rate", value: bounceRate(t), previous: bounceRate(p), format: formatPercent, lowerIsBetter: true },
		{ key: "duration", label: "Visit duration", value: avgVisit(t), previous: avgVisit(p), format: formatDuration },
	];
}

/** Relative change, or null when there is nothing to compare against. */
export function change(value: number, previous: number): number | null {
	if (previous <= 0) return null;
	return (value - previous) / previous;
}

export const RANGE_LABELS: Record<Range, string> = {
	"24h": "24 hours",
	"7d": "7 days",
	"30d": "30 days",
	"90d": "90 days",
};

export const METRIC_TITLES: Record<MetricType, string> = {
	path: "Pages",
	referrer: "Referrers",
	country: "Countries",
	browser: "Browsers",
	os: "Operating systems",
	device: "Devices",
	event: "Events",
};

const regionNames = (() => {
	try {
		return new Intl.DisplayNames(undefined, { type: "region" });
	} catch {
		return null;
	}
})();

const BROWSERS: Record<string, string> = {
	chrome: "Chrome",
	crios: "Chrome (iOS)",
	firefox: "Firefox",
	fxios: "Firefox (iOS)",
	safari: "Safari",
	ios: "Safari (iOS)",
	"ios-webview": "iOS web view",
	edge: "Edge",
	"edge-chromium": "Edge",
	"edge-ios": "Edge (iOS)",
	opera: "Opera",
	samsung: "Samsung Internet",
	"chromium-webview": "Android web view",
	facebook: "Facebook",
	instagram: "Instagram",
	brave: "Brave",
};

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export function metricLabel(type: MetricType, label: string): string {
	if (label === "(none)") {
		return type === "referrer" ? "Direct or unknown" : "Unknown";
	}
	if (type === "country") {
		try {
			return regionNames?.of(label.toUpperCase()) ?? label;
		} catch {
			return label;
		}
	}
	if (type === "browser") return BROWSERS[label] ?? capitalize(label);
	if (type === "device") return capitalize(label);
	return label;
}

export function relativeTime(t: number, now = Date.now()): string {
	const seconds = Math.max(0, Math.round((now - t) / 1000));
	if (seconds < 60) return "just now";
	const minutes = Math.round(seconds / 60);
	return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
}
