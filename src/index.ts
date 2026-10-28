import { definePlugin, type PluginDescriptor, type RouteContext } from "emdash";

import { active, overview, overviewInput } from "./routes/stats.js";
import { getSettings, saveSettings, saveSettingsInput, testConnection } from "./routes/settings.js";
import { dashboardUrl, missingSettings, readSettings, settingsSchema } from "./settings.js";
import { trackerFragment } from "./tracker.js";
import { PACKAGE_NAME, PLUGIN_ID, PLUGIN_VERSION, type StatusResponse } from "./shared/constants.js";

export type { StatusResponse } from "./shared/constants.js";
export type { StatsResult } from "./routes/stats.js";
export type * from "./shared/stats.js";
export type { ConnectionTestResult, SaveSettingsInput, SettingsView } from "./routes/settings.js";
export { PLUGIN_ID, PLUGIN_VERSION } from "./shared/constants.js";

/** Constructor options. Everything user-facing lives in the admin settings form instead. */
export type UmamiPluginOptions = Record<string, never>;

const ADMIN_ENTRY = `${PACKAGE_NAME}/admin`;

/**
 * Descriptor for astro.config.mjs:
 *
 *   import { umamiPlugin } from "@tdhftw/emdash-plugin-umami";
 *   emdash({ plugins: [umamiPlugin()] })
 */
export function umamiPlugin(options: UmamiPluginOptions = {}): PluginDescriptor<UmamiPluginOptions> {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint: PACKAGE_NAME,
		adminEntry: ADMIN_ENTRY,
		options,
	};
}

async function status(ctx: RouteContext): Promise<StatusResponse> {
	const s = await readSettings(ctx.settings);
	const missing = missingSettings(s);
	return {
		configured: missing.length === 0,
		missing,
		hosting: s.hosting,
		authMode: s.authMode,
		websiteId: s.websiteId,
		dashboardUrl: dashboardUrl(s),
		injectScript: s.injectScript,
		hasHttp: Boolean(ctx.http),
	};
}

/** Runtime definition. EmDash imports this named export from the package root. */
export function createPlugin(_options: UmamiPluginOptions = {}) {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		// The Umami host is configured by the site admin, so no fixed allowlist is possible.
		capabilities: ["network:request:unrestricted", "hooks.page-fragments:register"],
		hooks: {
			"page:fragments": (event, ctx) => trackerFragment(event, ctx.settings),
		},
		admin: {
			entry: ADMIN_ENTRY,
			settingsSchema,
			pages: [{ path: "/", label: "Analytics", icon: "chart-line" }],
			widgets: [{ id: "umami-overview", title: "Visitors", size: "half" }],
		},
		routes: {
			status: {
				permission: "plugins:read",
				handler: status,
			},
			overview: {
				permission: "plugins:read",
				input: overviewInput,
				handler: overview,
			},
			active: {
				permission: "plugins:read",
				handler: active,
			},
			settings: {
				permission: "plugins:manage",
				handler: getSettings,
			},
			"settings/save": {
				permission: "plugins:manage",
				input: saveSettingsInput,
				handler: saveSettings,
			},
			"connection/test": {
				permission: "plugins:manage",
				handler: testConnection,
			},
		},
	});
}

export default createPlugin;
