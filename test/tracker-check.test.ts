import { describe, expect, it } from "vitest";

import { judgeScan, scanPage, type CheckSettings } from "../src/admin/trackerCheck.js";

const ID = "abc12345-0000-4000-8000-000000000000";
const OTHER = "def67890-0000-4000-8000-000000000000";
const tag = (id: string, extra = "") => `<script defer src="https://stats.example.com/script.js" data-website-id="${id}"${extra}></script>`;
const page = (head: string) => `<!doctype html><html><head><meta charset="utf-8">${head}</head><body></body></html>`;
const on: CheckSettings = { websiteId: ID, injectScript: true, clientRouter: false };

describe("scanPage", () => {
	it("finds tracker tags by data-website-id, whatever the script is called", () => {
		const scan = scanPage(
			page(`${tag(ID)}<script src="/x.js"></script><SCRIPT data-website-id='${OTHER}' src=/stats.js async></SCRIPT><script>umami</script>`),
		);
		expect(scan.trackers).toEqual([
			{ src: "https://stats.example.com/script.js", websiteId: ID },
			{ src: "/stats.js", websiteId: OTHER },
		]);
		expect(scan.clientRouter).toBe(false);
	});

	it("notices Astro's ClientRouter meta", () => {
		expect(scanPage(page('<meta name="astro-view-transitions-enabled" content="true">')).clientRouter).toBe(true);
	});
});

describe("judgeScan", () => {
	const judge = (head: string, settings: Partial<CheckSettings> = {}) => judgeScan(scanPage(page(head)), { ...on, ...settings });

	it("passes one tracker for the chosen website", () => {
		expect(judge(tag(ID))).toMatchObject({ variant: "default", title: "One Umami tracker on the home page" });
	});

	it("flags double counting", () => {
		expect(judge(tag(ID) + tag(ID))).toMatchObject({ variant: "error", title: "2 Umami trackers on the home page" });
	});

	it("points at caching or prerendering when the plugin's tracker is missing", () => {
		const result = judge("");
		expect(result.variant).toBe("error");
		expect(result.description).toMatch(/cached.*prerendered/);
		expect(judge("", { injectScript: false }).variant).toBe("alert");
	});

	it("flags a tracker for another website", () => {
		expect(judge(tag(OTHER))).toMatchObject({ variant: "error", title: "The tracker counts a different website" });
		expect(judge(tag(OTHER), { websiteId: null }).variant).toBe("default");
	});

	it("suggests the ClientRouter setting when the page uses it", () => {
		const head = '<meta name="astro-view-transitions-enabled" content="true">' + tag(ID);
		expect(judge(head).variant).toBe("alert");
		expect(judge(head, { clientRouter: true }).variant).toBe("default");
		expect(judge(head, { injectScript: false }).variant).toBe("default");
	});
});
