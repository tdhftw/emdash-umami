import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import type { StatsResult } from "../shared/api-types.js";
import { RANGES, type Active, type Overview, type Range } from "../shared/stats.js";
import { callRoute } from "./api.js";

export function viewerTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

/** Unwraps `{ ok: false }` results into errors so React Query sees them as failures. */
async function unwrap<T>(route: string): Promise<T> {
	const result = await callRoute<StatsResult<T>>(route);
	if (!result.ok) throw Object.assign(new Error(result.message), { code: result.code });
	return result.data;
}

export function useOverview(range: Range) {
	const tz = viewerTimeZone();
	return useQuery({
		queryKey: ["plugin-umami", "overview", range, tz],
		queryFn: () => unwrap<Overview>(`overview?range=${range}&tz=${encodeURIComponent(tz)}`),
		placeholderData: (previous) => previous,
	});
}

export function useActive() {
	return useQuery({
		queryKey: ["plugin-umami", "active"],
		queryFn: () => unwrap<Active>("active"),
		refetchInterval: 30_000,
		refetchIntervalInBackground: false,
	});
}

const RANGE_KEY = "plugin-umami:range";

/** Selected range, remembered per browser. */
export function useRange(): [Range, (range: Range) => void] {
	const [range, setRange] = React.useState<Range>(() => {
		try {
			const saved = window.localStorage.getItem(RANGE_KEY);
			return (RANGES as readonly string[]).includes(saved ?? "") ? (saved as Range) : "7d";
		} catch {
			return "7d";
		}
	});
	const choose = React.useCallback((next: Range) => {
		setRange(next);
		try {
			window.localStorage.setItem(RANGE_KEY, next);
		} catch {
			// Storage can be unavailable; the choice then lasts for this page view.
		}
	}, []);
	return [range, choose];
}

/** Follows the admin's light/dark switch, which lives on <html data-mode>. */
export function useDarkMode(): boolean {
	const read = () => typeof document !== "undefined" && document.documentElement.getAttribute("data-mode") === "dark";
	const [dark, setDark] = React.useState(read);
	React.useEffect(() => {
		const observer = new MutationObserver(() => setDark(read()));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode", "class"] });
		return () => observer.disconnect();
	}, []);
	return dark;
}
