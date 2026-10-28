import type { PageFragmentContribution, PageFragmentEvent } from "emdash";

import { normalizeBaseUrl, readSettings, type SettingsReader } from "./settings.js";
import { defaultScriptUrl } from "./shared/tracker.js";

/**
 * Pageviews for sites using Astro's <ClientRouter />. Umami's own tracking hooks pushState only,
 * so back and forward are missed, and a re-run tracker tag counts forward navigations twice.
 * With `data-auto-pageview="false"` this sends one pageview per `astro:page-load` instead,
 * passing the URL explicitly because Umami's stored URL is stale after a back navigation. On a
 * page without <ClientRouter /> (no `astro-view-transitions-enabled` meta) it tracks once on
 * DOMContentLoaded, so a wrong setting never stops tracking.
 */
export const CLIENT_ROUTER_SCRIPT = `(()=>{let prev;const send=()=>{const u=window.umami;if(!u)return false;const url=location.href;u.track((p)=>({...p,url,title:document.title,...(prev?{referrer:prev}:{})}));prev=location.pathname+location.search;return true};const track=()=>{let n=0;const t=()=>{send()||++n>100||setTimeout(t,50)};t()};document.addEventListener("astro:page-load",track);document.addEventListener("DOMContentLoaded",()=>{document.querySelector('meta[name="astro-view-transitions-enabled"]')||track()})})();`;

/**
 * The Umami tracker as page fragments, or null when tracking is off or incomplete.
 * EmDash HTML-escapes attribute values and drops on* attributes when rendering.
 */
export async function trackerFragment(
	event: PageFragmentEvent,
	settings: SettingsReader,
): Promise<PageFragmentContribution | PageFragmentContribution[] | null> {
	// Never track the admin, and keep the per-request cost to one read while the feature is off.
	if (event.page.path.startsWith("/_emdash")) return null;
	if ((await settings.get<boolean>("injectScript")) !== true) return null;

	const s = await readSettings(settings);
	const src = defaultScriptUrl(s.hosting, s.baseUrl, s.scriptUrl);
	if (!src || !s.websiteId || !normalizeBaseUrl(src)) return null;

	const tracker: PageFragmentContribution = {
		kind: "external-script",
		placement: "head",
		src,
		defer: true,
		attributes: { "data-website-id": s.websiteId },
		key: "umami-tracker",
	};
	if (!s.clientRouter) return tracker;

	return [
		{ ...tracker, attributes: { ...tracker.attributes, "data-auto-pageview": "false" } },
		{ kind: "inline-script", placement: "head", code: CLIENT_ROUTER_SCRIPT, key: "umami-client-router" },
	];
}
