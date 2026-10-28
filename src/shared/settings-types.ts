import type { AuthMode, CloudRegion, Hosting } from "./constants.js";

export interface UmamiSettingsValues {
	hosting: Hosting;
	baseUrl: string | null;
	region: CloudRegion;
	authMode: AuthMode;
	username: string | null;
	websiteId: string | null;
	injectScript: boolean;
	scriptUrl: string | null;
}

export interface UmamiSettings extends UmamiSettingsValues {
	apiKey: string | null;
	password: string | null;
}
