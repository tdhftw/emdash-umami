# @tdhftw/emdash-plugin-umami

[Umami](https://umami.is) analytics inside the [EmDash](https://emdashcms.com) admin, for
self-hosted Umami. Umami Cloud support is built but switched off until it has been tested against
a Cloud account; it is planned for 0.2.0.

- **Analytics page.** Visitors, visits, pageviews, bounce rate and visit duration, each compared
  with the previous period. It also shows active visitors, a chart, and the top pages,
  referrers, countries, browsers, operating systems, devices and custom events for the last 24
  hours, 7, 30 or 90 days.
- **Dashboard widget.** The last 7 days at a glance, with a sparkline and active visitors.
- **Guided setup.** It checks the connection and lists the Umami websites you can pick from.
- **Optional tracker.** It can add the Umami script to your public pages, so the theme doesn't
  need to.

> Status: 0.1.x, self-hosted Umami only. Tested with EmDash 1.0.1 to 1.3.1 and Umami 3.4.

## Requirements

- EmDash 1.0 or later, with Astro 7.
- A self-hosted Umami and an API key for it. Umami 3.x has API keys under Settings → API keys.
  Older versions can sign in with a username and password instead.
- `EMDASH_ENCRYPTION_KEY` set on the site, which EmDash needs to store the API key or password
  encrypted. Generate one with `npx emdash secrets generate`. On Cloudflare, store it with
  `wrangler secret put EMDASH_ENCRYPTION_KEY`.

## Install

```bash
npm install @tdhftw/emdash-plugin-umami
```

```js
// astro.config.mjs
import { umamiPlugin } from "@tdhftw/emdash-plugin-umami";

export default defineConfig({
	integrations: [
		emdash({
			// ...database, storage and the rest of your config
			plugins: [umamiPlugin()],
		}),
	],
});
```

This is a native EmDash plugin, so it goes in `plugins`, not `sandboxed`. Deploy the site after
adding it.

## Set up

1. Open **Analytics** in the admin sidebar. Until Umami is connected, it opens on **Settings**.
2. Enter the address you open Umami at, for example `https://stats.example.com`. The Umami Cloud
   option is shown but disabled until 0.2.0.
3. Paste an API key, or on older self-hosted versions, a username and password.
4. Select **Save and test connection**. When it connects, the websites the key can see appear
   under **Website**, including sites shared with you through a team.
5. Pick the website, then save again.

The key and password are encrypted with `EMDASH_ENCRYPTION_KEY` and never sent back to the
browser. The same settings are also available from the gear on the plugin's card under
**Plugins**, as a plain form.

## Adding the tracker (optional)

Turning on **Add the Umami tracker to public pages** adds the Umami script to the `<head>` of
every public page:

```html
<script src="https://stats.example.com/script.js" defer data-website-id="…"></script>
```

- **Theme requirement.** Your theme must render EmDash's `<EmDashHead>` component, as the EmDash
  templates do.
- **Avoid double counting.** Remove any Umami script the theme already includes, or every visit
  is counted twice.
- **Custom script URL.** Set one if you serve a renamed tracker or proxy it.
- **Cached pages.** If your site caches pages, cached copies change over only when their cache
  expires.
- **Admin pages** are never tracked.

## Permissions

| Capability | Why |
| --- | --- |
| `network:request:unrestricted` | Umami's address is configured by you, so no fixed host list is possible. The plugin only calls the Umami URL you set. |
| `hooks.page-fragments:register` | Needed only for the optional tracker. |

Reading statistics requires the `plugins:read` permission. Changing settings requires
`plugins:manage`.

## Caching and rate limits

- **Statistics** are cached in the plugin's storage for 1 minute on the 24-hour range, and up to
  15 minutes on longer ranges. If Umami can't be reached, the last saved copy is shown and
  marked as such.
- **Active visitors** are cached for 20 seconds.
- **One overview load** makes 10 requests to Umami. That matters for Umami Cloud, which allows
  50 requests per 15 seconds per key.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

`src/index.ts` holds the plugin definition, settings schema, routes and hooks. It is compiled to
`dist/`. `src/admin/` is the React admin UI. It ships as source because the site's own build
compiles it.

To try the plugin in a local EmDash site, install a packed tarball rather than a folder link. A
linked folder brings along a second copy of React.

```bash
npm run build && npm pack --pack-destination /tmp
cd ../your-site && npm install --no-save /tmp/tdhftw-emdash-plugin-umami-<version>.tgz
```

**Two EmDash quirks to know about under `astro dev`** (still present in 1.3.1):

- **Host-context hooks crash.** Plugin components can't use the admin's Lingui or React Query
  providers, because dev mode loads a second copy of those libraries
  ([emdash#3587](https://github.com/emdash-cms/emdash/issues/3587)). This plugin brings its own
  React Query client and doesn't use Lingui.
- **The dev admin can look off.** It may pick up the site's own stylesheet. Production builds
  don't.

## License

MIT © Thord D. Hedengren
