import type { PluginAdminExports } from "emdash";

import { AnalyticsPage } from "./AnalyticsPage.js";
import { withQueryClient } from "./query.js";
import { OverviewWidget } from "./Widget.js";

export const pages: PluginAdminExports["pages"] = {
	"/": withQueryClient(AnalyticsPage),
};

export const widgets: PluginAdminExports["widgets"] = {
	"umami-overview": withQueryClient(OverviewWidget),
};
