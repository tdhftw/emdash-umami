import type { SettingField } from "emdash";

import { CLOUD_ENABLED, type AuthMode, type CloudRegion, type Hosting } from "./shared/constants.js";

/** Minimal slice of EmDash's SettingsAccess this module needs; keeps it unit-testable. */
export interface SettingsReader {
	get<T>(key: string): Promise<T | undefined | null>;
}

export type { UmamiSettings } from "./shared/settings-types.js";
import type { UmamiSettings } from "./shared/settings-types.js";

/**
 * Settings form schema. EmDash renders it under Plugins → Umami → settings; `secret` fields are
 * encrypted with EMDASH_ENCRYPTION_KEY and never sent back to the browser. Defaults only fill the
 * form, they are not persisted, so readSettings() applies the same fallbacks.
 */
export const settingsSchema = {
	hosting: {
		type: "select",
		label: "Hosting",
		description: "Tip: Analytics → Settings in the sidebar has a guided setup with a connection test and a website picker.",
		options: [
			{ value: "self-hosted", label: "Self-hosted Umami" },
			...(CLOUD_ENABLED ? [{ value: "cloud", label: "Umami Cloud" }] : []),
		],
		default: "self-hosted",
	},
	baseUrl: {
		type: "url",
		label: "Umami URL (self-hosted)",
		placeholder: "https://stats.example.com",
	},
	region: {
		type: "select",
		label: CLOUD_ENABLED ? "Region (Umami Cloud)" : "Region (Umami Cloud, coming in 0.2.0)",
		options: [
			{ value: "default", label: "Account default" },
			{ value: "us", label: "United States" },
			{ value: "eu", label: "European Union" },
		],
		default: "default",
	},
	authMode: {
		type: "select",
		label: "Sign in with",
		options: [
			{ value: "apiKey", label: "API key" },
			{ value: "password", label: "Username and password (older self-hosted Umami)" },
		],
		default: "apiKey",
	},
	apiKey: {
		type: "secret",
		label: "API key",
		description: "Umami → Settings → API keys.",
	},
	username: {
		type: "string",
		label: "Username (password sign-in)",
	},
	password: {
		type: "secret",
		label: "Password (password sign-in)",
	},
	websiteId: {
		type: "string",
		label: "Website ID",
		description: "Umami → Settings → Websites → Edit. A UUID.",
	},
	injectScript: {
		type: "boolean",
		label: "Add the Umami tracker to public pages",
		default: false,
	},
	scriptUrl: {
		type: "url",
		label: "Custom tracker script URL",
		description: "Optional. Default: <Umami URL>/script.js.",
		placeholder: "https://stats.example.com/script.js",
	},
} satisfies Record<string, SettingField>;

function str(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Strips trailing slashes and a trailing /api so users can paste either form. */
export function normalizeBaseUrl(value: string | null): string | null {
	if (!value) return null;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	const path = url.pathname.replace(/\/+$/, "").replace(/\/api$/, "");
	return `${url.origin}${path}`;
}

export async function readSettings(settings: SettingsReader): Promise<UmamiSettings> {
	const keys = Object.keys(settingsSchema) as (keyof typeof settingsSchema)[];
	const values = await Promise.all(keys.map((key) => settings.get<unknown>(key)));
	const raw = Object.fromEntries(keys.map((key, i) => [key, values[i]])) as Record<keyof typeof settingsSchema, unknown>;

	const hosting = oneOf<Hosting>(raw.hosting, CLOUD_ENABLED ? ["self-hosted", "cloud"] : ["self-hosted"], "self-hosted");
	return {
		hosting,
		baseUrl: normalizeBaseUrl(str(raw.baseUrl)),
		region: oneOf<CloudRegion>(raw.region, ["default", "us", "eu"], "default"),
		// Umami Cloud only accepts API keys.
		authMode: hosting === "cloud" ? "apiKey" : oneOf<AuthMode>(raw.authMode, ["apiKey", "password"], "apiKey"),
		apiKey: str(raw.apiKey),
		username: str(raw.username),
		password: typeof raw.password === "string" && raw.password.length > 0 ? raw.password : null,
		websiteId: str(raw.websiteId),
		injectScript: raw.injectScript === true,
		scriptUrl: normalizeScriptUrl(str(raw.scriptUrl)),
	};
}

function normalizeScriptUrl(value: string | null): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
	} catch {
		return null;
	}
}

/** Names of settings that must be filled in before Umami can be queried. */
export function missingSettings(s: UmamiSettings): string[] {
	const missing: string[] = [];
	if (s.hosting === "self-hosted" && !s.baseUrl) missing.push("baseUrl");
	if (s.authMode === "apiKey" && !s.apiKey) missing.push("apiKey");
	if (s.authMode === "password") {
		if (!s.username) missing.push("username");
		if (!s.password) missing.push("password");
	}
	if (!s.websiteId) missing.push("websiteId");
	return missing;
}

/** Where a person views this site's stats in Umami. */
export function dashboardUrl(s: UmamiSettings): string | null {
	const origin = s.hosting === "cloud" ? "https://cloud.umami.is" : s.baseUrl;
	if (!origin) return null;
	return s.websiteId ? `${origin}/websites/${encodeURIComponent(s.websiteId)}` : origin;
}
