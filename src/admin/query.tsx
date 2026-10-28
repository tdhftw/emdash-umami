import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType } from "react";

/**
 * The plugin brings its own QueryClient instead of using the admin's.
 *
 * In `astro dev`, EmDash pre-bundles @emdash-cms/admin with private copies of @tanstack/react-query
 * and @lingui/react, so a plugin that imports those packages gets different module instances and
 * cannot see the admin's providers ("useLingui hook was used without I18nProvider"). A production
 * build shares one copy, but relying on that would break local development. So: no host-context
 * hooks in plugin components; wrap each exported page and widget with this provider instead.
 */
const queryClient = new QueryClient({
	defaultOptions: {
		queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
	},
});

export function withQueryClient<P extends object>(Component: ComponentType<P>): ComponentType<P> {
	function WithQueryClient(props: P) {
		return (
			<QueryClientProvider client={queryClient}>
				<Component {...props} />
			</QueryClientProvider>
		);
	}
	WithQueryClient.displayName = `WithQueryClient(${Component.displayName ?? Component.name})`;
	return WithQueryClient;
}
