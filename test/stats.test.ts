import { describe, expect, it } from "vitest";

import { cached, type CacheKV } from "../src/cache.js";
import { buckets, labelFromUmami, mergeSeries, toRows, toTotals, windowFor } from "../src/umami/stats.js";

const at = (iso: string) => Date.parse(iso);

describe("windowFor", () => {
	it("uses hours for 24h and days otherwise", () => {
		const now = at("2026-09-28T20:30:00Z");
		expect(windowFor("24h", now)).toMatchObject({ unit: "hour", endAt: now });
		expect(windowFor("30d", now).unit).toBe("day");
		expect(now - windowFor("7d", now).startAt).toBe(7 * 86_400_000 - 1);
	});
});

describe("buckets", () => {
	it("labels hours in the site's zone and starts buckets on the hour", () => {
		const win = windowFor("24h", at("2026-09-28T20:30:00Z"));
		const b = buckets(win, "Europe/Stockholm");
		expect(b.at(-1)).toEqual({ label: "2026-09-28 22:00", t: at("2026-09-28T20:00:00Z") });
		expect(b).toHaveLength(25);
		expect(new Set(b.map((x) => x.label)).size).toBe(b.length);
	});

	it("has one bucket per local day across a DST change", () => {
		// Europe/Stockholm leaves summer time on 2026-10-25 (a 25-hour day).
		const win = windowFor("7d", at("2026-10-28T12:00:00Z"));
		const labels = buckets(win, "Europe/Stockholm").map((x) => x.label);
		expect(labels).toEqual(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]);
	});
});

describe("mergeSeries", () => {
	it("fills missing buckets with zero and accepts Umami's date formats", () => {
		const win = windowFor("7d", at("2026-09-28T20:00:00Z"));
		const series = mergeSeries(
			win,
			"Europe/Stockholm",
			[{ x: "2026-09-28 00:00:00", y: "64" }, { x: "2026-09-25T00:00:00Z", y: 3 }],
			[{ x: "2026-09-28 00:00:00", y: 6 }],
		);
		expect(series).toHaveLength(8);
		expect(series.find((p) => p.label === "2026-09-28")).toMatchObject({ pageviews: 64, visitors: 6 });
		expect(series.find((p) => p.label === "2026-09-25")).toMatchObject({ pageviews: 3, visitors: 0 });
		expect(series.find((p) => p.label === "2026-09-22")).toMatchObject({ pageviews: 0, visitors: 0 });
	});

	it("normalizes hour labels", () => {
		expect(labelFromUmami("2026-09-28 14:00:00", "hour")).toBe("2026-09-28 14:00");
		expect(labelFromUmami("2026-09-28T14:00:00Z", "hour")).toBe("2026-09-28 14:00");
	});
});

describe("toTotals / toRows", () => {
	it("coerces bigint strings and missing fields", () => {
		expect(toTotals({ pageviews: "64", visitors: 6, totaltime: null })).toEqual({ pageviews: 64, visitors: 6, visits: 0, bounces: 0, totaltime: 0 });
		expect(toTotals(null).pageviews).toBe(0);
	});

	it("labels empty values, drops zero rows and limits", () => {
		expect(toRows([{ x: "", y: 2 }, { x: null, y: 1 }, { x: "/a", y: 0 }, { x: "/b", y: "5" }], 10)).toEqual([
			{ label: "(none)", value: 2 },
			{ label: "(none)", value: 1 },
			{ label: "/b", value: 5 },
		]);
		expect(toRows("nope", 10)).toEqual([]);
		expect(toRows([{ x: "a", y: 1 }, { x: "b", y: 1 }], 1)).toHaveLength(1);
	});
});

describe("cached", () => {
	function memory(): CacheKV & { store: Map<string, unknown> } {
		const store = new Map<string, unknown>();
		return { store, get: async <T>(k: string) => store.get(k) as T, set: async (k, v) => void store.set(k, v) };
	}

	it("serves fresh entries, reloads old ones, and falls back to stale data on failure", async () => {
		const kv = memory();
		let calls = 0;
		const load = async () => ++calls;
		expect(await cached(kv, "k", 1000, load, 0)).toEqual({ value: 1, stale: false });
		expect(await cached(kv, "k", 1000, load, 500)).toEqual({ value: 1, stale: false });
		expect(await cached(kv, "k", 1000, load, 2000)).toEqual({ value: 2, stale: false });
		const failing = async () => {
			throw new Error("down");
		};
		expect(await cached(kv, "k", 1000, failing, 9000)).toEqual({ value: 2, stale: true });
		await expect(cached(memory(), "k", 1000, failing, 0)).rejects.toThrow("down");
	});
});
