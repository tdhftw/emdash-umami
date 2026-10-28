import { Banner, Button } from "@cloudflare/kumo";
import { useMutation } from "@tanstack/react-query";
import * as React from "react";

import { judgeScan, scanPage, type CheckSettings } from "./trackerCheck.js";

/** Loads the public home page as a signed-out visitor would get it and reports its Umami tags. */
async function checkHomePage(settings: CheckSettings) {
	const res = await fetch("/", { credentials: "omit", cache: "no-store" });
	if (!res.ok) throw new Error(`The home page answered ${res.status}.`);
	return judgeScan(scanPage(await res.text()), settings);
}

export function TrackerCheck({ settings }: { settings: CheckSettings }) {
	const check = useMutation({ mutationFn: checkHomePage });
	return (
		<div className="space-y-3">
			<Button type="button" variant="secondary" loading={check.isPending} onClick={() => check.mutate(settings)}>
				Check the live site
			</Button>
			{check.error ? (
				<Banner variant="error" title="Could not load the home page" description={(check.error as Error).message} />
			) : check.data ? (
				<Banner variant={check.data.variant} title={check.data.title} description={check.data.description} />
			) : (
				<p className="text-sm text-kumo-subtle">Looks for Umami trackers on your home page, against the saved settings.</p>
			)}
		</div>
	);
}
