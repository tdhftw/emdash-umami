import { describe, expect, it, vi } from "vitest";

import type { UmamiSettings } from "../src/settings.js";
import { TOKEN_KEY, UmamiError, apiBase, createUmamiClient, listWebsites, type UmamiDeps } from "../src/umami/client.js";

const base: UmamiSettings = {
	hosting: "self-hosted",
	baseUrl: "https://stats.example.com",
	region: "default",
	authMode: "apiKey",
	apiKey: "umami_secretkey",
	username: null,
	password: null,
	websiteId: "w1",
	injectScript: false,
	clientRouter: false,
	scriptUrl: null,
};

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function deps(responder: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	const store = new Map<string, unknown>();
	const fetch = vi.fn(async (url: string, init?: RequestInit) => responder(url, init));
	const kv: UmamiDeps["kv"] = {
		get: async <T>(k: string) => store.get(k) as T | undefined,
		set: async (k, v) => void store.set(k, v),
		delete: async (k) => store.delete(k),
	};
	return { fetch, kv, store };
}

describe("apiBase", () => {
	it("uses /api on self-hosted and the v1 API on cloud, with regions", () => {
		expect(apiBase(base)).toBe("https://stats.example.com/api");
		expect(apiBase({ ...base, hosting: "cloud" })).toBe("https://api.umami.is/v1");
		expect(apiBase({ ...base, hosting: "cloud", region: "eu" })).toBe("https://api.umami.is/v1/eu");
		expect(apiBase({ ...base, baseUrl: null })).toBeNull();
	});
});

describe("createUmamiClient", () => {
	it("refuses to build without the settings it needs", () => {
		const d = deps(() => json({}));
		expect(() => createUmamiClient({ ...base, apiKey: null }, d)).toThrow(UmamiError);
		expect(() => createUmamiClient({ ...base, baseUrl: null }, d)).toThrow(/Umami URL/);
		expect(() => createUmamiClient({ ...base, authMode: "password" }, d)).toThrow(/username and password/);
	});

	it("sends the API key as a bearer token and builds the query string", async () => {
		const d = deps(() => json({ ok: true }));
		await createUmamiClient(base, d).get("/websites/w1/stats", { startAt: 1, endAt: 2, unit: undefined });
		const [url, init] = d.fetch.mock.calls[0]!;
		expect(url).toBe("https://stats.example.com/api/websites/w1/stats?startAt=1&endAt=2");
		expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer umami_secretkey");
	});

	it("logs in once with a password, caches the token, and re-logs in after a 401", async () => {
		let tokenGeneration = 0;
		let rejectNext = false;
		const d = deps((url, init) => {
			if (url.endsWith("/auth/login")) {
				expect(JSON.parse(String(init?.body))).toEqual({ username: "tdh", password: "hunter2" });
				return json({ token: `t${++tokenGeneration}` });
			}
			if (rejectNext) {
				rejectNext = false;
				return json({ error: "expired" }, 401);
			}
			return json({ auth: new Headers(init?.headers).get("Authorization") });
		});
		const client = createUmamiClient({ ...base, authMode: "password", apiKey: null, username: "tdh", password: "hunter2" }, d);

		expect(await client.get("/a")).toEqual({ auth: "Bearer t1" });
		expect(await client.get("/b")).toEqual({ auth: "Bearer t1" });
		expect(d.fetch.mock.calls.filter(([u]) => u.endsWith("/auth/login"))).toHaveLength(1);

		rejectNext = true;
		expect(await client.get("/c")).toEqual({ auth: "Bearer t2" });
		expect((d.store.get(TOKEN_KEY) as { token: string }).token).toBe("t2");
	});

	it.each([
		[401, "unauthorized"],
		[403, "forbidden"],
		[404, "not-found"],
		[429, "rate-limited"],
		[500, "upstream"],
	] as const)("maps HTTP %i to %s without leaking the key", async (status, code) => {
		const d = deps(() => json({}, status));
		const error = await createUmamiClient(base, d).get("/x").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(UmamiError);
		expect((error as UmamiError).code).toBe(code);
		expect((error as UmamiError).message).not.toContain("umami_secretkey");
	});

	it("reports network failures as unreachable, naming only the origin", async () => {
		const d = deps(() => {
			throw new TypeError("fetch failed");
		});
		const error = (await createUmamiClient(base, d).get("/x").catch((e: unknown) => e)) as UmamiError;
		expect(error.code).toBe("unreachable");
		expect(error.message).toContain("https://stats.example.com");
	});

	it("reports non-JSON answers as upstream errors", async () => {
		const d = deps(() => new Response("<html>login</html>", { status: 200 }));
		const error = (await createUmamiClient(base, d).get("/x").catch((e: unknown) => e)) as UmamiError;
		expect(error.code).toBe("upstream");
	});
});

describe("listWebsites", () => {
	it("asks for team websites, normalizes fields and sorts by name", async () => {
		const d = deps((url) => {
			const path = new URL(url).pathname;
			if (path === "/api/websites") {
				expect(url).toContain("includeTeams=true");
				return json({ data: [{ id: "b", name: "site", domain: "example.com" }, { id: "a", name: "", domain: "" }, { name: "no id" }] });
			}
			if (path === "/api/teams") return json({ data: [{ id: "t1" }, { id: "t2" }] });
			if (path === "/api/teams/t1/websites") return json({ data: [{ id: "c", name: "shared", domain: "x.se" }, { id: "b", name: "dupe" }] });
			return json({}, 403);
		});
		const sites = await listWebsites(createUmamiClient(base, d));
		expect(sites).toEqual([
			{ id: "a", name: "a", domain: null },
			{ id: "c", name: "shared", domain: "x.se" },
			{ id: "b", name: "site", domain: "example.com" },
		]);
	});
});
