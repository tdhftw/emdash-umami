import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createPlugin, umamiPlugin } from "../src/index.js";
import { PACKAGE_NAME, PLUGIN_ID, PLUGIN_VERSION } from "../src/shared/constants.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
	name: string;
	version: string;
	exports: Record<string, unknown>;
};

describe("plugin contract", () => {
	it("keeps package, descriptor and runtime identity in sync", () => {
		const descriptor = umamiPlugin();
		const plugin = createPlugin();
		expect(pkg.name).toBe(PACKAGE_NAME);
		expect(pkg.version).toBe(PLUGIN_VERSION);
		expect(descriptor.id).toBe(PLUGIN_ID);
		expect(descriptor.version).toBe(PLUGIN_VERSION);
		expect(plugin.id).toBe(descriptor.id);
		expect(plugin.version).toBe(descriptor.version);
	});

	it("is a native plugin whose admin entry matches the package export", () => {
		const descriptor = umamiPlugin();
		const plugin = createPlugin();
		expect(descriptor.format).toBe("native");
		expect(descriptor.entrypoint).toBe(PACKAGE_NAME);
		expect(descriptor.adminEntry).toBe(`${PACKAGE_NAME}/admin`);
		expect(plugin.admin?.entry).toBe(descriptor.adminEntry);
		expect(pkg.exports["./admin"]).toBe("./src/admin/index.tsx");
	});

	it("declares the unrestricted network capability and the status route", () => {
		const plugin = createPlugin();
		expect(plugin.capabilities).toEqual(expect.arrayContaining(["network:request:unrestricted", "hooks.page-fragments:register"]));
		expect(Object.keys(plugin.routes ?? {})).toEqual(expect.arrayContaining(["status", "overview", "active", "settings", "settings/save", "connection/test"]));
		expect(plugin.admin?.pages?.map((p) => p.path)).toEqual(["/"]);
		expect(plugin.admin?.widgets?.map((w) => w.id)).toEqual(["umami-overview"]);
	});

	it("keeps secrets in secret-type settings", () => {
		const schema = createPlugin().admin?.settingsSchema ?? {};
		expect(schema.apiKey?.type).toBe("secret");
		expect(schema.password?.type).toBe("secret");
	});
});

describe("settings/save input", () => {
	it("rejects non-http URLs at the schema, where the host reports them as validation errors", async () => {
		const { saveSettingsInput } = await import("../src/routes/settings.js");
		expect(saveSettingsInput.safeParse({ baseUrl: "ftp://x" }).success).toBe(false);
		expect(saveSettingsInput.safeParse({ scriptUrl: "javascript:alert(1)" }).success).toBe(false);
		expect(saveSettingsInput.safeParse({ baseUrl: "https://stats.example.com/", apiKey: null }).success).toBe(true);
		expect(saveSettingsInput.safeParse({ baseUrl: null }).success).toBe(true);
	});

	it("refuses Umami Cloud until 0.2.0 and hides it from the host form", async () => {
		const { saveSettingsInput } = await import("../src/routes/settings.js");
		const { CLOUD_ENABLED } = await import("../src/shared/constants.js");
		expect(CLOUD_ENABLED).toBe(false);
		expect(saveSettingsInput.safeParse({ hosting: "cloud" }).success).toBe(false);
		expect(saveSettingsInput.safeParse({ hosting: "self-hosted" }).success).toBe(true);
		const hosting = createPlugin().admin?.settingsSchema?.hosting as { options: Array<{ value: string }> };
		expect(hosting.options.map((o) => o.value)).toEqual(["self-hosted"]);
	});
});
