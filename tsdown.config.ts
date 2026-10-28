import { defineConfig } from "tsdown";

// Only the server entry is compiled. The admin entry (src/admin) ships as source because the
// host's Vite build must bundle it against the host's own React, Kumo, Lingui and React Query.
export default defineConfig({
	entry: ["src/index.ts"],
	format: "esm",
	dts: true,
	clean: true,
	platform: "neutral",
	target: "es2022",
});
