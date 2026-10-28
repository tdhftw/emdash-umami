/** Route payloads shared by the server routes and the admin UI (which ships as source). */
import type { UmamiSettingsValues } from "./settings-types.js";

export type UmamiErrorCode =
	| "not-configured"
	| "unauthorized"
	| "forbidden"
	| "not-found"
	| "rate-limited"
	| "unreachable"
	| "upstream";

export interface UmamiWebsite {
	id: string;
	name: string;
	domain: string | null;
}

/** Settings as the admin sees them: everything except secret values. */
export interface SettingsView {
	values: UmamiSettingsValues;
	secretsSet: { apiKey: boolean; password: boolean };
}

export type ConnectionTestResult =
	| { ok: true; websites: UmamiWebsite[]; website: UmamiWebsite | null }
	| { ok: false; code: UmamiErrorCode; message: string };

export type StatsResult<T> = { ok: true; data: T } | { ok: false; code: UmamiErrorCode; message: string };

/** Body of `settings/save`. Secrets: a string replaces, null clears, omitted keeps. */
export interface SaveSettingsInput {
	hosting?: "self-hosted" | "cloud";
	baseUrl?: string | null;
	region?: "default" | "us" | "eu";
	authMode?: "apiKey" | "password";
	apiKey?: string | null;
	username?: string | null;
	password?: string | null;
	websiteId?: string | null;
	injectScript?: boolean;
	scriptUrl?: string | null;
}
