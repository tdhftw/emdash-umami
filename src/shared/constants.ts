/** Plugin id. One URL segment: routes mount at /_emdash/api/plugins/umami/<route>. */
export const PLUGIN_ID = "umami";

/** Keep in sync with package.json; test/plugin.test.ts enforces it. */
export const PLUGIN_VERSION = "0.1.3";

export const PACKAGE_NAME = "@tdhftw/emdash-plugin-umami";

export const API_BASE = `/_emdash/api/plugins/${PLUGIN_ID}`;

export type Hosting = "self-hosted" | "cloud";

/**
 * Umami Cloud support is implemented but not yet verified against a Cloud account, so it is
 * switched off for 0.1.x: the option shows as disabled and the server refuses to save it.
 * Planned for 0.2.0.
 */
export const CLOUD_ENABLED = false;
export type AuthMode = "apiKey" | "password";
export type CloudRegion = "default" | "us" | "eu";

/** Shape returned by the `status` route. Shared by server and admin. */
export interface StatusResponse {
	configured: boolean;
	/** Settings that still need a value before the plugin can query Umami. */
	missing: string[];
	hosting: Hosting;
	authMode: AuthMode;
	websiteId: string | null;
	/** Origin of the Umami dashboard, for "open in Umami" links. Never contains credentials. */
	dashboardUrl: string | null;
	injectScript: boolean;
	/** Whether the host handed this plugin a ctx.http client. */
	hasHttp: boolean;
}
