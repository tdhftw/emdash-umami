import { z } from "astro/zod";
import type { RouteContext } from "emdash";

import { CLOUD_ENABLED } from "../shared/constants.js";
import { normalizeBaseUrl, readSettings, type UmamiSettings } from "../settings.js";
import { TOKEN_KEY, UmamiError, describeCause, createUmamiClient, getWebsite, listWebsites } from "../umami/client.js";

export type { ConnectionTestResult, SettingsView } from "../shared/api-types.js";
import type { ConnectionTestResult, SaveSettingsInput, SettingsView } from "../shared/api-types.js";

function view(s: UmamiSettings): SettingsView {
	const { apiKey, password, ...values } = s;
	return { values, secretsSet: { apiKey: apiKey !== null, password: password !== null } };
}

export async function getSettings(ctx: RouteContext): Promise<SettingsView> {
	return view(await readSettings(ctx.settings));
}

const optionalText = z.string().trim().max(2048).nullable().optional();
/**
 * URL fields are validated in the input schema, not by throwing from the handler: in `astro dev` a
 * PluginRouteError thrown here is a different class instance from the host's and surfaces as a
 * generic INTERNAL_ERROR, while schema failures always come back as VALIDATION_ERROR.
 */
const optionalUrl = optionalText.refine((value) => !value || normalizeBaseUrl(value) !== null, {
	message: "Must be an address starting with https:// or http://",
});
/** Secrets: a string replaces the stored value, null clears it, omitted keeps it. */
const secretInput = z.string().max(4096).nullable().optional();

export const saveSettingsInput = z.object({
	hosting: z
		.enum(["self-hosted", "cloud"])
		.refine((h) => CLOUD_ENABLED || h !== "cloud", { message: "Umami Cloud support arrives in 0.2.0" })
		.optional(),
	baseUrl: optionalUrl,
	region: z.enum(["default", "us", "eu"]).optional(),
	authMode: z.enum(["apiKey", "password"]).optional(),
	apiKey: secretInput,
	username: optionalText,
	password: secretInput,
	websiteId: optionalText,
	injectScript: z.boolean().optional(),
	scriptUrl: optionalUrl,
});
export type { SaveSettingsInput } from "../shared/api-types.js";

// Keep the Zod schema and the shared interface in step.
const _schemaMatches: z.ZodType<SaveSettingsInput> = saveSettingsInput;
void _schemaMatches;

export async function saveSettings(ctx: RouteContext<SaveSettingsInput>): Promise<SettingsView> {
	const input = ctx.input;

	const writes: Promise<unknown>[] = [];
	const put = (key: string, value: unknown) => {
		if (value === undefined) return;
		if (value === null || value === "") writes.push(ctx.settings.delete(key));
		else writes.push(ctx.settings.set(key, value));
	};

	put("hosting", input.hosting);
	put("baseUrl", input.baseUrl === undefined ? undefined : normalizeBaseUrl(input.baseUrl ?? null));
	put("region", input.region);
	put("authMode", input.authMode);
	put("apiKey", input.apiKey === undefined ? undefined : input.apiKey?.trim() || null);
	put("username", input.username);
	put("password", input.password);
	put("websiteId", input.websiteId);
	put("injectScript", input.injectScript);
	put("scriptUrl", input.scriptUrl);
	await Promise.all(writes);

	// Any credential or server change makes a cached login token meaningless.
	if (input.baseUrl !== undefined || input.username !== undefined || input.password !== undefined || input.hosting !== undefined) {
		await ctx.kv.delete(TOKEN_KEY);
	}
	return getSettings(ctx);
}

function clientFor(ctx: RouteContext, s: UmamiSettings) {
	const http = ctx.http;
	if (!http) throw new UmamiError("unreachable", "EmDash did not grant this plugin network access.");
	return createUmamiClient(s, { fetch: (url, init) => http.fetch(url, init), kv: ctx.kv });
}

/** Checks the saved settings against Umami. Returns failures as data so the UI can explain them. */
export async function testConnection(ctx: RouteContext): Promise<ConnectionTestResult> {
	const s = await readSettings(ctx.settings);
	try {
		const client = clientFor(ctx, s);
		const websites = await listWebsites(client);
		let website = websites.find((w) => w.id === s.websiteId) ?? null;
		// A site can be readable without showing up in any list (e.g. shared by id); ask directly.
		if (!website && s.websiteId) {
			website = await getWebsite(client, s.websiteId);
			if (website) websites.push(website);
		}
		return { ok: true, websites, website };
	} catch (error) {
		if (error instanceof UmamiError) {
			if (error.cause) ctx.log.warn("Umami request failed", { code: error.code, cause: describeCause(error.cause) });
			return { ok: false, code: error.code, message: error.message };
		}
		ctx.log.error("Umami connection test failed", { error: error instanceof Error ? error.message : String(error) });
		return { ok: false, code: "upstream", message: "The connection test failed unexpectedly. See the server log." };
	}
}
