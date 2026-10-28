import { Banner, Button, Loader, Tabs } from "@cloudflare/kumo";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import type { StatusResponse } from "../shared/constants.js";
import { callRoute } from "./api.js";
import { OverviewView } from "./OverviewView.js";
import { SettingsView } from "./SettingsView.js";

type Tab = "overview" | "settings";

function tabFromHash(): Tab | null {
	if (typeof window === "undefined") return null;
	return window.location.hash === "#settings" ? "settings" : window.location.hash === "#overview" ? "overview" : null;
}

export function AnalyticsPage() {
	const status = useQuery({
		queryKey: ["plugin-umami", "status"],
		queryFn: () => callRoute<StatusResponse>("status"),
	});
	const [tab, setTab] = React.useState<Tab | null>(tabFromHash);

	// Until Umami is connected, the settings are the useful view.
	const active: Tab = tab ?? (status.data && !status.data.configured ? "settings" : "overview");
	const choose = (next: Tab) => {
		setTab(next);
		window.history.replaceState(null, "", `#${next}`);
	};

	return (
		<section className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<h1 className="text-2xl font-semibold">Analytics</h1>
				{status.data?.dashboardUrl ? (
					<a className="text-sm underline" href={status.data.dashboardUrl} target="_blank" rel="noreferrer">
						Open in Umami
					</a>
				) : null}
			</div>
			<Tabs
				variant="underline"
				value={active}
				onValueChange={(value) => choose(value as Tab)}
				tabs={[
					{ value: "overview", label: "Overview" },
					{ value: "settings", label: "Settings" },
				]}
			/>
			{active === "settings" ? (
				<SettingsView />
			) : status.isLoading ? (
				<Loader />
			) : status.error ? (
				<Banner variant="error" title="Could not load the plugin status" description={(status.error as Error).message} />
			) : status.data && !status.data.configured ? (
				<Banner
					title="Umami is not connected yet"
					description={
						<>
							Finish the setup to see statistics here.{" "}
							<Button type="button" variant="secondary" size="sm" onClick={() => choose("settings")}>
								Open settings
							</Button>
						</>
					}
				/>
			) : (
				<OverviewView onOpenSettings={() => choose("settings")} />
			)}
		</section>
	);
}
