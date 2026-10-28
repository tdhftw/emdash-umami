import type { PageFragmentContribution, PageFragmentEvent } from "emdash";

import { normalizeBaseUrl, readSettings, type SettingsReader } from "./settings.js";
import { defaultScriptUrl } from "./shared/tracker.js";

/**
 * The Umami tracker as a page fragment, or null when tracking is off or incomplete.
 * EmDash HTML-escapes attribute values and drops on* attributes when rendering.
 */
export async function trackerFragment(event: PageFragmentEvent, settings: SettingsReader): Promise<PageFragmentContribution | null> {
	// Never track the admin, and keep the per-request cost to one read while the feature is off.
	if (event.page.path.startsWith("/_emdash")) return null;
	if ((await settings.get<boolean>("injectScript")) !== true) return null;

	const s = await readSettings(settings);
	const src = defaultScriptUrl(s.hosting, s.baseUrl, s.scriptUrl);
	if (!src || !s.websiteId || !normalizeBaseUrl(src)) return null;

	return {
		kind: "external-script",
		placement: "head",
		src,
		defer: true,
		attributes: { "data-website-id": s.websiteId },
		key: "umami-tracker",
	};
}
