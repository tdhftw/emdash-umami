import { describe, expect, it } from "vitest";

import { CLOUD_ENABLED } from "../src/shared/constants.js";
import { dashboardUrl, missingSettings, normalizeBaseUrl, readSettings, type SettingsReader } from "../src/settings.js";

function reader(values: Record<string, unknown>): SettingsReader {
	return { get: async <T>(key: string) => values[key] as T | undefined };
}

describe("normalizeBaseUrl", () => {
	it.each([
		["https://stats.example.com", "https://stats.example.com"],
		["https://stats.example.com/", "https://stats.example.com"],
		["https://stats.example.com/api", "https://stats.example.com"],
		["https://stats.example.com/api/", "https://stats.example.com"],
		["https://example.com/umami/", "https://example.com/umami"],
		["http://localhost:3000", "http://localhost:3000"],
	])("%s -> %s", (input, expected) => {
		expect(normalizeBaseUrl(input)).toBe(expected);
	});

	it.each(["not a url", "ftp://stats.example.com", "javascript:alert(1)"])("rejects %s", (input) => {
		expect(normalizeBaseUrl(input)).toBeNull();
	});
});

describe("readSettings", () => {
	it("applies schema defaults when nothing is stored", async () => {
		const s = await readSettings(reader({}));
		expect(s).toMatchObject({
			hosting: "self-hosted",
			region: "default",
			authMode: "apiKey",
			injectScript: false,
			baseUrl: null,
			apiKey: null,
			websiteId: null,
		});
		expect(missingSettings(s)).toEqual(["baseUrl", "apiKey", "websiteId"]);
	});

	it.skipIf(CLOUD_ENABLED)("treats a stored Cloud choice as self-hosted while Cloud is switched off", async () => {
		const s = await readSettings(reader({ hosting: "cloud", baseUrl: "https://stats.example.com", apiKey: "k", websiteId: "w" }));
		expect(s.hosting).toBe("self-hosted");
	});

	it.skipIf(!CLOUD_ENABLED)("forces API-key auth on Umami Cloud and ignores baseUrl", async () => {
		const s = await readSettings(reader({ hosting: "cloud", authMode: "password", apiKey: "umami_x", websiteId: "w" }));
		expect(s.authMode).toBe("apiKey");
		expect(missingSettings(s)).toEqual([]);
		expect(dashboardUrl(s)).toBe("https://cloud.umami.is/websites/w");
	});

	it("requires username and password in password mode", async () => {
		const s = await readSettings(
			reader({ baseUrl: "https://stats.example.com/api/", authMode: "password", username: "  ", websiteId: "w" }),
		);
		expect(s.baseUrl).toBe("https://stats.example.com");
		expect(missingSettings(s)).toEqual(["username", "password"]);
	});

	it("falls back on unknown select values and trims strings", async () => {
		const s = await readSettings(reader({ hosting: "moon", region: "mars", websiteId: "  abc  ", injectScript: "yes" }));
		expect(s.hosting).toBe("self-hosted");
		expect(s.region).toBe("default");
		expect(s.websiteId).toBe("abc");
		expect(s.injectScript).toBe(false);
	});

	it("builds the self-hosted dashboard link", async () => {
		const s = await readSettings(reader({ baseUrl: "https://stats.example.com", websiteId: "abc12345" }));
		expect(dashboardUrl(s)).toBe("https://stats.example.com/websites/abc12345");
	});
});
