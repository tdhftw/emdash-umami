import type { UmamiSettings } from "../settings.js";

import type { UmamiErrorCode, UmamiWebsite } from "../shared/api-types.js";

export type { UmamiErrorCode, UmamiWebsite } from "../shared/api-types.js";

/** Error with a stable code for the UI. Messages never contain credentials. */
export class UmamiError extends Error {
	constructor(
		readonly code: UmamiErrorCode,
		message: string,
		readonly status?: number,
		options?: { cause?: unknown },
	) {
		super(message, options);
		this.name = "UmamiError";
	}
}

export interface UmamiDeps {
	fetch: (url: string, init?: RequestInit) => Promise<Response>;
	/** Plugin KV, used only to cache the login token in password mode. */
	kv: {
		get<T>(key: string): Promise<T | null | undefined>;
		set(key: string, value: unknown): Promise<void>;
		delete(key: string): Promise<unknown>;
	};
}

/** Server-log description of a low-level failure. Fetch errors carry URLs, never our headers. */
export function describeCause(cause: unknown): string {
	if (cause instanceof Error) {
		const inner = cause.cause instanceof Error ? ` (${cause.cause.name}: ${cause.cause.message})` : "";
		return `${cause.name}: ${cause.message}${inner}`;
	}
	return String(cause);
}

export const TOKEN_KEY = "state:token";
const TIMEOUT_MS = 10_000;

interface CachedToken {
	token: string;
	/** Which server and user the token belongs to; a settings change invalidates it. */
	scope: string;
}

/** API root: `<baseUrl>/api` when self-hosted, `https://api.umami.is/v1[/region]` on Umami Cloud. */
export function apiBase(s: Pick<UmamiSettings, "hosting" | "baseUrl" | "region">): string | null {
	if (s.hosting === "cloud") {
		return s.region === "default" ? "https://api.umami.is/v1" : `https://api.umami.is/v1/${s.region}`;
	}
	return s.baseUrl ? `${s.baseUrl}/api` : null;
}

function describeStatus(status: number, what: string): UmamiError {
	if (status === 401) {
		return new UmamiError("unauthorized", "Umami rejected the credentials. Check the API key, or the username and password.", status);
	}
	if (status === 403) {
		return new UmamiError("forbidden", `This Umami account is not allowed to read ${what}.`, status);
	}
	if (status === 404) {
		return new UmamiError("not-found", `Umami could not find ${what}. Check the Umami URL and the website.`, status);
	}
	if (status === 429) {
		return new UmamiError("rate-limited", "Umami is rate limiting requests. Try again in a minute.", status);
	}
	return new UmamiError("upstream", `Umami answered with HTTP ${status} for ${what}.`, status);
}

export interface UmamiClient {
	get<T>(path: string, query?: Record<string, string | number | boolean | undefined>, what?: string): Promise<T>;
}

export function createUmamiClient(s: UmamiSettings, deps: UmamiDeps): UmamiClient {
	const base = apiBase(s);
	if (!base) throw new UmamiError("not-configured", "Add the Umami URL in the Umami settings.");
	if (s.authMode === "apiKey" && !s.apiKey) throw new UmamiError("not-configured", "Add an Umami API key in the Umami settings.");
	if (s.authMode === "password" && (!s.username || !s.password)) {
		throw new UmamiError("not-configured", "Add the Umami username and password in the Umami settings.");
	}

	async function send(url: string, init: RequestInit, what: string): Promise<Response> {
		try {
			return await deps.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
		} catch (cause) {
			throw new UmamiError("unreachable", `Could not reach Umami at ${new URL(url).origin} while loading ${what}.`, undefined, { cause });
		}
	}

	const scope = `${base}|${s.username ?? ""}`;

	async function login(): Promise<string> {
		const res = await send(
			`${base}/auth/login`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json", Accept: "application/json" },
				body: JSON.stringify({ username: s.username, password: s.password }),
			},
			"the login",
		);
		if (!res.ok) throw describeStatus(res.status === 400 ? 401 : res.status, "the login");
		const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
		if (!body || typeof body.token !== "string") {
			throw new UmamiError("upstream", "Umami's login answer had no token. Is this an Umami server?");
		}
		await deps.kv.set(TOKEN_KEY, { token: body.token, scope } satisfies CachedToken);
		return body.token;
	}

	async function bearer(forceLogin: boolean): Promise<string> {
		if (s.authMode === "apiKey") return s.apiKey as string;
		if (!forceLogin) {
			const cached = await deps.kv.get<CachedToken>(TOKEN_KEY);
			if (cached && cached.scope === scope) return cached.token;
		}
		return login();
	}

	return {
		async get<T>(path: string, query: Record<string, string | number | boolean | undefined> = {}, what = "the data"): Promise<T> {
			const url = new URL(`${base}${path}`);
			for (const [key, value] of Object.entries(query)) {
				if (value !== undefined) url.searchParams.set(key, String(value));
			}
			const request = async (forceLogin: boolean) =>
				send(url.toString(), { headers: { Authorization: `Bearer ${await bearer(forceLogin)}`, Accept: "application/json" } }, what);

			let res = await request(false);
			// A cached login token can expire or be revoked; log in again once.
			if (res.status === 401 && s.authMode === "password") {
				await deps.kv.delete(TOKEN_KEY);
				res = await request(true);
			}
			if (!res.ok) throw describeStatus(res.status, what);
			try {
				return (await res.json()) as T;
			} catch {
				throw new UmamiError("upstream", `Umami's answer for ${what} was not JSON. Is the Umami URL right?`);
			}
		},
	};
}

interface Page<T> {
	data?: T[];
}

type RawWebsite = { id?: unknown; name?: unknown; domain?: unknown };

function toWebsite(w: RawWebsite): UmamiWebsite | null {
	if (typeof w.id !== "string") return null;
	return {
		id: w.id,
		name: typeof w.name === "string" && w.name ? w.name : w.id,
		domain: typeof w.domain === "string" && w.domain ? w.domain : null,
	};
}

/**
 * Websites the credentials can read, sorted by name: the user's own and those of teams they own or
 * manage (`/websites?includeTeams`), plus every team they belong to in any role (`/teams/{id}/websites`),
 * which covers sites shared with a plain team member.
 */
export async function listWebsites(client: UmamiClient): Promise<UmamiWebsite[]> {
	const [own, teams] = await Promise.all([
		client.get<Page<RawWebsite>>("/websites", { includeTeams: true, pageSize: 200 }, "the website list"),
		client.get<Page<{ id?: unknown }>>("/teams", { pageSize: 100 }, "the team list").catch(() => ({ data: [] })),
	]);
	const teamIds = (teams.data ?? []).map((t) => t.id).filter((id): id is string => typeof id === "string");
	const teamSites = await Promise.all(
		teamIds.map((id) =>
			client
				.get<Page<RawWebsite>>(`/teams/${encodeURIComponent(id)}/websites`, { pageSize: 200 }, "a team's websites")
				.catch(() => ({ data: [] as RawWebsite[] })),
		),
	);
	const byId = new Map<string, UmamiWebsite>();
	for (const raw of [...(own.data ?? []), ...teamSites.flatMap((page) => page.data ?? [])]) {
		const site = toWebsite(raw);
		if (site && !byId.has(site.id)) byId.set(site.id, site);
	}
	return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** One website by id, or null when Umami says it does not exist or is not visible. */
export async function getWebsite(client: UmamiClient, id: string): Promise<UmamiWebsite | null> {
	try {
		return toWebsite(await client.get<RawWebsite>(`/websites/${encodeURIComponent(id)}`, {}, "the website"));
	} catch (error) {
		if (error instanceof UmamiError && (error.code === "not-found" || error.code === "forbidden")) return null;
		throw error;
	}
}
