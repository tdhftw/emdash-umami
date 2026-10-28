import type { PageFragmentEvent } from "emdash";
import { describe, expect, it, vi } from "vitest";

import type { SettingsReader } from "../src/settings.js";
import { defaultScriptUrl } from "../src/shared/tracker.js";
import { trackerFragment } from "../src/tracker.js";

const page = (path: string) => ({ page: { path } }) as unknown as PageFragmentEvent;

function settings(values: Record<string, unknown>) {
	const get = vi.fn(async (key: string) => values[key]);
	return { get: get as SettingsReader["get"], calls: get };
}

const on = { injectScript: true, baseUrl: "https://stats.example.com", websiteId: "abc12345" };

describe("defaultScriptUrl", () => {
	it("prefers the custom URL, then the hosting default", () => {
		expect(defaultScriptUrl("self-hosted", "https://stats.example.com/api/", null)).toBe("https://stats.example.com/script.js");
		expect(defaultScriptUrl("cloud", null, null)).toBe("https://cloud.umami.is/script.js");
		expect(defaultScriptUrl("cloud", null, "https://example.com/u.js")).toBe("https://example.com/u.js");
		expect(defaultScriptUrl("self-hosted", null, null)).toBeNull();
	});
});

describe("trackerFragment", () => {
	it("adds a deferred head script with the website id", async () => {
		expect(await trackerFragment(page("/42"), settings(on))).toEqual({
			kind: "external-script",
			placement: "head",
			src: "https://stats.example.com/script.js",
			defer: true,
			attributes: { "data-website-id": "abc12345" },
			key: "umami-tracker",
		});
	});

	it("reads a single setting while tracking is off", async () => {
		const s = settings({ ...on, injectScript: false });
		expect(await trackerFragment(page("/"), s)).toBeNull();
		expect(s.calls).toHaveBeenCalledTimes(1);
	});

	it("never tracks admin pages", async () => {
		const s = settings(on);
		expect(await trackerFragment(page("/_emdash/admin"), s)).toBeNull();
		expect(s.calls).not.toHaveBeenCalled();
	});

	it("stays off until the website and script location are known", async () => {
		expect(await trackerFragment(page("/"), settings({ ...on, websiteId: undefined }))).toBeNull();
		expect(await trackerFragment(page("/"), settings({ ...on, baseUrl: undefined }))).toBeNull();
		expect(await trackerFragment(page("/"), settings({ ...on, scriptUrl: "javascript:alert(1)" }))?.valueOf()).toMatchObject({
			src: "https://stats.example.com/script.js",
		});
	});
});
