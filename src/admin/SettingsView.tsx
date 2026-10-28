import { Banner, Button, Input, Loader, Radio, Select, SensitiveInput, Surface, Switch } from "@cloudflare/kumo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import type { ConnectionTestResult, SaveSettingsInput, SettingsView as Settings } from "../shared/api-types.js";
import { CLOUD_ENABLED, type AuthMode, type CloudRegion, type Hosting } from "../shared/constants.js";
import { defaultScriptUrl } from "../shared/tracker.js";
import { callRoute } from "./api.js";

interface Draft {
	hosting: Hosting;
	baseUrl: string;
	region: CloudRegion;
	authMode: AuthMode;
	apiKey: string;
	username: string;
	password: string;
	websiteId: string;
	injectScript: boolean;
	clientRouter: boolean;
	scriptUrl: string;
}

function draftFrom(s: Settings): Draft {
	const v = s.values;
	return {
		hosting: v.hosting,
		baseUrl: v.baseUrl ?? "",
		region: v.region,
		authMode: v.authMode,
		apiKey: "",
		username: v.username ?? "",
		password: "",
		websiteId: v.websiteId ?? "",
		injectScript: v.injectScript,
		clientRouter: v.clientRouter,
		scriptUrl: v.scriptUrl ?? "",
	};
}

/** Only send what the chosen setup uses; empty secret fields mean "keep the saved one". */
function toInput(d: Draft): SaveSettingsInput {
	const input: SaveSettingsInput = {
		hosting: d.hosting,
		authMode: d.hosting === "cloud" ? "apiKey" : d.authMode,
		websiteId: d.websiteId || null,
		injectScript: d.injectScript,
		clientRouter: d.clientRouter,
		scriptUrl: d.scriptUrl || null,
	};
	if (d.hosting === "self-hosted") input.baseUrl = d.baseUrl || null;
	else input.region = d.region;
	if (d.apiKey) input.apiKey = d.apiKey;
	if (input.authMode === "password") {
		input.username = d.username || null;
		if (d.password) input.password = d.password;
	}
	return input;
}

function Section({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
	return (
		<Surface className="rounded-lg p-5">
			<div className="space-y-4">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">{title}</h2>
					{description ? <p className="text-sm text-kumo-subtle">{description}</p> : null}
				</div>
				{children}
			</div>
		</Surface>
	);
}

function urlError(value: string): string | undefined {
	if (!value) return undefined;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:" ? undefined : "Use an address starting with https://";
	} catch {
		return "Use a full address, for example https://stats.example.com";
	}
}

function trackerUrl(d: Draft): string | null {
	return defaultScriptUrl(d.hosting, d.baseUrl || null, d.scriptUrl || null);
}

export function SettingsView({ onSaved }: { onSaved?: () => void }) {
	const queryClient = useQueryClient();
	const settings = useQuery({ queryKey: ["plugin-umami", "settings"], queryFn: () => callRoute<Settings>("settings") });
	const [draft, setDraft] = React.useState<Draft | null>(null);
	const [showCustomScript, setShowCustomScript] = React.useState(false);

	React.useEffect(() => {
		if (settings.data && !draft) {
			setDraft(draftFrom(settings.data));
			setShowCustomScript(Boolean(settings.data.values.scriptUrl));
		}
	}, [settings.data, draft]);

	const hasCredentials = settings.data
		? settings.data.values.authMode === "apiKey"
			? settings.data.secretsSet.apiKey
			: settings.data.secretsSet.password && Boolean(settings.data.values.username)
		: false;

	// Check the saved connection on load so the website list is ready.
	const test = useQuery({
		queryKey: ["plugin-umami", "connection"],
		queryFn: () => callRoute<ConnectionTestResult>("connection/test", {}),
		enabled: hasCredentials,
		staleTime: 5 * 60_000,
	});

	const save = useMutation({
		mutationFn: async (d: Draft) => {
			const saved = await callRoute<Settings>("settings/save", toInput(d));
			const result = await callRoute<ConnectionTestResult>("connection/test", {});
			return { saved, result };
		},
		onSuccess: ({ saved, result }) => {
			queryClient.setQueryData(["plugin-umami", "settings"], saved);
			queryClient.setQueryData(["plugin-umami", "connection"], result);
			void queryClient.invalidateQueries({ queryKey: ["plugin-umami", "status"] });
			setDraft(draftFrom(saved));
			onSaved?.();
		},
	});

	if (settings.isLoading || !draft) {
		return settings.error ? (
			<Banner variant="error" title="Could not load the settings" description={String((settings.error as Error).message)} />
		) : (
			<Loader />
		);
	}

	const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
	const secrets = settings.data?.secretsSet ?? { apiKey: false, password: false };
	const connection = test.data;
	const websites = connection?.ok ? connection.websites : [];
	const selectedKnown = websites.some((w) => w.id === draft.websiteId);
	const tracker = trackerUrl(draft);
	const authMode: AuthMode = draft.hosting === "cloud" ? "apiKey" : draft.authMode;

	return (
		<form
			className="max-w-2xl space-y-6"
			onSubmit={(event) => {
				event.preventDefault();
				if (draft.hosting === "self-hosted" && urlError(draft.baseUrl)) return;
				if (draft.scriptUrl && urlError(draft.scriptUrl)) return;
				save.mutate(draft);
			}}
		>
			<Section title="Umami server" description="Where your Umami statistics live.">
				<Radio.Group
					legend="Hosting"
					orientation="horizontal"
					value={draft.hosting}
					onValueChange={(value) => set("hosting", value as Hosting)}
				>
					<Radio.Item label="Self-hosted Umami" value="self-hosted" />
					<Radio.Item
						label={CLOUD_ENABLED ? "Umami Cloud" : "Umami Cloud (coming in 0.2.0)"}
						value="cloud"
						disabled={!CLOUD_ENABLED}
					/>
				</Radio.Group>
				{draft.hosting === "self-hosted" ? (
					<Input
						label="Umami URL"
						description="The address you open Umami at, for example https://stats.example.com."
						type="url"
						placeholder="https://stats.example.com"
						value={draft.baseUrl}
						error={urlError(draft.baseUrl)}
						onChange={(event) => set("baseUrl", event.target.value.trim())}
					/>
				) : (
					<Select
						label="Region"
						description="Leave on account default unless Umami support told you otherwise."
						value={draft.region}
						onValueChange={(value) => set("region", value as CloudRegion)}
						items={{ default: "Account default", us: "United States", eu: "European Union" }}
					/>
				)}
			</Section>

			<Section
				title="Sign in"
				description={
					authMode === "apiKey"
						? "Create a key in Umami under Settings → API keys. It is stored encrypted and never shown again."
						: "Use this only for Umami versions without API keys. The password is stored encrypted."
				}
			>
				{draft.hosting === "self-hosted" ? (
					<Radio.Group
						legend="Method"
						orientation="horizontal"
						value={draft.authMode}
						onValueChange={(value) => set("authMode", value as AuthMode)}
					>
						<Radio.Item label="API key" value="apiKey" />
						<Radio.Item label="Username and password" value="password" />
					</Radio.Group>
				) : null}
				{authMode === "apiKey" ? (
					<SensitiveInput
						label="API key"
						description={secrets.apiKey ? "A key is saved. Paste a new one only to replace it." : undefined}
						placeholder={secrets.apiKey ? "Saved key, leave empty to keep" : "umami_…"}
						value={draft.apiKey}
						onValueChange={(value) => set("apiKey", value)}
					/>
				) : (
					<>
						<Input label="Username" value={draft.username} onChange={(event) => set("username", event.target.value)} />
						<SensitiveInput
							label="Password"
							description={secrets.password ? "A password is saved. Type a new one only to replace it." : undefined}
							placeholder={secrets.password ? "Saved password, leave empty to keep" : ""}
							value={draft.password}
							onValueChange={(value) => set("password", value)}
						/>
					</>
				)}
			</Section>

			<Section title="Website" description="Which Umami website belongs to this site.">
				{test.isFetching ? (
					<Loader />
				) : websites.length > 0 ? (
					<Select
						label="Website"
						placeholder="Choose a website"
						value={draft.websiteId || null}
						onValueChange={(value) => set("websiteId", typeof value === "string" ? value : "")}
						items={Object.fromEntries([
							...websites.map((w) => [w.id, w.domain ? `${w.name} (${w.domain})` : w.name]),
							...(draft.websiteId && !selectedKnown ? [[draft.websiteId, `${draft.websiteId} (not found in Umami)`]] : []),
						])}
					/>
				) : hasCredentials && connection?.ok ? (
					<Input
						label="Website ID"
						description="This Umami account lists no websites, so enter the ID by hand. In Umami, open Settings → Websites → Edit and copy the Website ID."
						placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
						value={draft.websiteId}
						onChange={(event) => set("websiteId", event.target.value.trim())}
					/>
				) : (
					<p className="text-sm text-kumo-subtle">
						{hasCredentials
							? "No websites to choose from until the connection works."
							: "Save your server and sign-in details first. The websites you can see in Umami will then appear here."}
					</p>
				)}
			</Section>

			<Section title="Tracking" description="Optional. Let this plugin add the Umami tracker to your public pages.">
				<Switch
					label="Add the Umami tracker to public pages"
					checked={draft.injectScript}
					onCheckedChange={(checked) => set("injectScript", checked)}
				/>
				<p className="text-sm text-kumo-subtle">
					If your site caches pages, cached copies change over when their cache expires, not the moment you save.
				</p>
				{draft.injectScript ? (
					<>
						<Banner
							variant="alert"
							title="Remove any tracker already in your theme"
							description="If the theme also includes the Umami script, every visit is counted twice. The theme must render EmDashHead."
						/>
						<Switch
							label="The site uses Astro's <ClientRouter /> (view transitions)"
							checked={draft.clientRouter}
							onCheckedChange={(checked) => set("clientRouter", checked)}
						/>
						<p className="text-sm text-kumo-subtle">
							Turn this on if your layout includes <code>&lt;ClientRouter /&gt;</code>. Pages then change without a full
							load, and this counts each one once, including back and forward. Needs Umami 3.2 or later.
						</p>
					</>
				) : null}
				<p className="text-sm text-kumo-subtle">
					Tracker script: <code>{tracker ?? "set the Umami URL first"}</code>{" "}
					<Button type="button" variant="ghost" size="sm" onClick={() => setShowCustomScript((v) => !v)}>
						{showCustomScript ? "Use the default" : "Use a custom script URL"}
					</Button>
				</p>
				{showCustomScript ? (
					<Input
						label="Custom tracker script URL"
						description="For a renamed tracker (recommended against ad blockers) or a proxy."
						type="url"
						value={draft.scriptUrl}
						error={urlError(draft.scriptUrl)}
						onChange={(event) => set("scriptUrl", event.target.value.trim())}
					/>
				) : null}
			</Section>

			<div className="space-y-4">
				{save.error ? (
					<Banner variant="error" title="Could not save" description={(save.error as Error).message} />
				) : null}
				{connection && !test.isFetching ? (
					connection.ok ? (
						<Banner
							title="Connected to Umami"
							description={
								connection.website
									? `Showing statistics for ${connection.website.name}.`
									: `${connection.websites.length} website${connection.websites.length === 1 ? "" : "s"} available. Choose one above and save.`
							}
						/>
					) : (
						<Banner variant="error" title="Could not connect to Umami" description={connection.message} />
					)
				) : null}
				<Button type="submit" variant="primary" loading={save.isPending}>
					Save and test connection
				</Button>
			</div>
		</form>
	);
}
