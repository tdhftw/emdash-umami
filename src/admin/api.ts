import { apiFetch, parseApiResponse } from "emdash/plugin-utils";

import { API_BASE } from "../shared/constants.js";

/** GET or POST a plugin route and unwrap EmDash's `{ success, data }` envelope. */
export async function callRoute<T>(route: string, body?: unknown): Promise<T> {
	const response = await apiFetch(
		`${API_BASE}/${route}`,
		body === undefined
			? undefined
			: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
	);
	return parseApiResponse<T>(response, "The Umami plugin did not answer");
}
