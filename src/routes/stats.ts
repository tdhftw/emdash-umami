import { z } from "astro/zod";
import type { RouteContext } from "emdash";

import { cached } from "../cache.js";
import { readSettings } from "../settings.js";
import { RANGES, type Active, type Overview } from "../shared/stats.js";
import { UmamiError, createUmamiClient, describeCause } from "../umami/client.js";
import { fetchActive, fetchOverview, isValidTimeZone } from "../umami/stats.js";

export type { StatsResult } from "../shared/api-types.js";
import type { StatsResult } from "../shared/api-types.js";

export const overviewInput = z.object({
	range: z.enum(RANGES).default("7d"),
	tz: z
		.string()
		.max(64)
		.optional()
		.transform((tz) => (tz && isValidTimeZone(tz) ? tz : "UTC")),
});
export type OverviewInput = z.infer<typeof overviewInput>;

/** 24h data moves quickly; longer ranges barely change minute to minute. */
const OVERVIEW_MAX_AGE = { "24h": 60_000, "7d": 5 * 60_000, "30d": 10 * 60_000, "90d": 15 * 60_000 } as const;
const ACTIVE_MAX_AGE = 20_000;

async function withClient<T>(ctx: RouteContext, run: (client: ReturnType<typeof createUmamiClient>, websiteId: string) => Promise<T>): Promise<StatsResult<T>> {
	try {
		const s = await readSettings(ctx.settings);
		if (!s.websiteId) throw new UmamiError("not-configured", "Choose the Umami website in the plugin settings.");
		const http = ctx.http;
		if (!http) throw new UmamiError("unreachable", "EmDash did not grant this plugin network access.");
		const client = createUmamiClient(s, { fetch: (url, init) => http.fetch(url, init), kv: ctx.kv });
		return { ok: true, data: await run(client, s.websiteId) };
	} catch (error) {
		if (error instanceof UmamiError) {
			if (error.cause) ctx.log.warn("Umami request failed", { code: error.code, cause: describeCause(error.cause) });
			return { ok: false, code: error.code, message: error.message };
		}
		ctx.log.error("Umami request failed", { error: error instanceof Error ? error.message : String(error) });
		return { ok: false, code: "upstream", message: "Loading statistics failed unexpectedly. See the server log." };
	}
}

export function overview(ctx: RouteContext<OverviewInput>): Promise<StatsResult<Overview>> {
	const { range, tz } = ctx.input;
	return withClient(ctx, async (client, websiteId) => {
		const hit = await cached(ctx.kv, `cache:overview:${websiteId}:${range}:${tz}`, OVERVIEW_MAX_AGE[range], () =>
			fetchOverview(client, websiteId, range, tz),
		);
		return { ...hit.value, stale: hit.stale };
	});
}

export function active(ctx: RouteContext): Promise<StatsResult<Active>> {
	return withClient(ctx, async (client, websiteId) => {
		const hit = await cached(ctx.kv, `cache:active:${websiteId}`, ACTIVE_MAX_AGE, () => fetchActive(client, websiteId));
		return hit.value;
	});
}
