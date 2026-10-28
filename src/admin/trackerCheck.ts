export interface FoundTracker {
	src: string | null;
	websiteId: string;
}

export interface PageScan {
	trackers: FoundTracker[];
	/** Astro adds this meta when the layout renders <ClientRouter />. */
	clientRouter: boolean;
}

export interface CheckSettings {
	websiteId: string | null;
	injectScript: boolean;
	clientRouter: boolean;
}

export interface CheckResult {
	variant: "default" | "alert" | "error";
	title: string;
	description: string;
}

function attributes(tag: string): Map<string, string> {
	const attrs = new Map<string, string>();
	for (const m of tag.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
		attrs.set(m[1]!.toLowerCase(), m[2] ?? m[3] ?? m[4] ?? "");
	}
	return attrs;
}

/** Finds Umami tracker tags (any <script> with data-website-id, so renamed trackers count too). */
export function scanPage(html: string): PageScan {
	const trackers: FoundTracker[] = [];
	for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
		const attrs = attributes(m[1]!);
		const websiteId = attrs.get("data-website-id");
		if (websiteId !== undefined) trackers.push({ src: attrs.get("src") ?? null, websiteId });
	}
	const clientRouter = [...html.matchAll(/<meta\b([^>]*)>/gi)].some(
		(m) => attributes(m[1]!).get("name") === "astro-view-transitions-enabled",
	);
	return { trackers, clientRouter };
}

const ONLY_HOME = "This checks the home page only; other pages can differ.";

/** Turns a scan of the live home page into advice, judged against the saved settings. */
export function judgeScan(scan: PageScan, settings: CheckSettings): CheckResult {
	const { trackers } = scan;
	if (trackers.length === 0) {
		return settings.injectScript
			? {
					variant: "error",
					title: "No Umami tracker on the home page",
					description:
						"The tracker is switched on, so the page is probably an older cached copy (it changes over when the cache expires) or prerendered, which plugins can't add to. See the README for prerendered pages.",
				}
			: {
					variant: "alert",
					title: "No Umami tracker on the home page",
					description: "Visits are not being counted. Turn on the tracker above, or add Umami's tag to your theme.",
				};
	}
	if (trackers.length > 1) {
		return {
			variant: "error",
			title: `${trackers.length} Umami trackers on the home page`,
			description: `Each visit is counted ${trackers.length} times. Remove the tracker from your theme, or switch off the plugin's. ${ONLY_HOME}`,
		};
	}
	const found = trackers[0]!;
	if (settings.websiteId && found.websiteId !== settings.websiteId) {
		return {
			variant: "error",
			title: "The tracker counts a different website",
			description: `The home page sends visits to website ${found.websiteId}, not the one chosen above.`,
		};
	}
	if (scan.clientRouter && !settings.clientRouter && settings.injectScript) {
		return {
			variant: "alert",
			title: "The site uses <ClientRouter />",
			description: "Turn on the <ClientRouter /> setting above, or back and forward navigation is not counted.",
		};
	}
	return {
		variant: "default",
		title: "One Umami tracker on the home page",
		description: settings.websiteId ? `It counts the website chosen above. ${ONLY_HOME}` : ONLY_HOME,
	};
}
