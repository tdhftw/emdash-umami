import type { Hosting } from "./constants.js";

export const CLOUD_SCRIPT_URL = "https://cloud.umami.is/script.js";

/** The tracker script a site should load: the custom URL if set, else the hosting default. */
export function defaultScriptUrl(hosting: Hosting, baseUrl: string | null, scriptUrl: string | null): string | null {
	if (scriptUrl) return scriptUrl;
	if (hosting === "cloud") return CLOUD_SCRIPT_URL;
	return baseUrl ? `${baseUrl.replace(/\/+$/, "").replace(/\/api$/, "")}/script.js` : null;
}
