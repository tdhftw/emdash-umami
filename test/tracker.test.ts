import { runInNewContext } from "node:vm";

import type { PageFragmentEvent } from "emdash";
import { describe, expect, it, vi } from "vitest";

import type { SettingsReader } from "../src/settings.js";
import { defaultScriptUrl } from "../src/shared/tracker.js";
import { CLIENT_ROUTER_SCRIPT, trackerFragment } from "../src/tracker.js";

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

	it("for <ClientRouter /> sites, turns off Umami's pageviews and adds the page-load script", async () => {
		expect(await trackerFragment(page("/"), settings({ ...on, clientRouter: true }))).toEqual([
			{
				kind: "external-script",
				placement: "head",
				src: "https://stats.example.com/script.js",
				defer: true,
				attributes: { "data-website-id": "abc12345", "data-auto-pageview": "false" },
				key: "umami-tracker",
			},
			{ kind: "inline-script", placement: "head", code: CLIENT_ROUTER_SCRIPT, key: "umami-client-router" },
		]);
	});
});

/** Runs the inline script against a minimal fake browser and records what it sends to Umami. */
function fakeBrowser({ clientRouter }: { clientRouter: boolean }) {
	const listeners: Record<string, (() => void)[]> = {};
	const sent: Record<string, unknown>[] = [];
	const location = { href: "https://example.com/", pathname: "/", search: "" };
	const document = {
		title: "Home",
		addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn),
		querySelector: (selector: string) => (clientRouter && selector.includes("astro-view-transitions-enabled") ? {} : null),
	};
	const window: Record<string, unknown> = {};
	const umami = {
		track: (fn: (p: Record<string, unknown>) => Record<string, unknown>) =>
			sent.push(fn({ website: "abc12345", url: "stale", referrer: "https://search.example/" })),
	};
	runInNewContext(CLIENT_ROUTER_SCRIPT, { window, document, location, setTimeout: (fn: () => void) => fn() });
	return {
		sent,
		umamiLoads: () => (window.umami = umami),
		fire: (type: string) => listeners[type]?.forEach((fn) => fn()),
		go: (path: string, title: string) => Object.assign(location, { href: `https://example.com${path}`, pathname: path }) && (document.title = title),
	};
}

describe("CLIENT_ROUTER_SCRIPT", () => {
	it("sends one pageview per astro:page-load with the current URL, title and previous path", () => {
		const b = fakeBrowser({ clientRouter: true });
		b.umamiLoads();
		b.fire("DOMContentLoaded");
		b.fire("astro:page-load");
		b.go("/2026/10/post", "Post");
		b.fire("astro:page-load");
		b.go("/", "Home");
		b.fire("astro:page-load"); // back
		expect(b.sent).toEqual([
			{ website: "abc12345", url: "https://example.com/", referrer: "https://search.example/", title: "Home" },
			{ website: "abc12345", url: "https://example.com/2026/10/post", referrer: "/", title: "Post" },
			{ website: "abc12345", url: "https://example.com/", referrer: "/2026/10/post", title: "Home" },
		]);
	});

	it("tracks once on DOMContentLoaded when the page has no <ClientRouter />", () => {
		const b = fakeBrowser({ clientRouter: false });
		b.umamiLoads();
		b.fire("DOMContentLoaded");
		expect(b.sent).toHaveLength(1);
	});

	it("gives up quietly when Umami never loads", () => {
		const b = fakeBrowser({ clientRouter: true });
		expect(() => b.fire("astro:page-load")).not.toThrow();
		expect(b.sent).toHaveLength(0);
	});
});
