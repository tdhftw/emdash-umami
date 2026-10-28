# Changelog

## 0.1.3 (2026-10-28)

- New tracker setting for sites that use Astro's `<ClientRouter />`: every page change, including
  back and forward, is counted once. Without it, Umami misses back and forward navigation, and a
  tag with `data-astro-rerun` counts each link click twice. Needs Umami 3.2 or later.
- README: the setting above, and how to switch over from a tracker tag in the theme.

## 0.1.2 (2026-10-28)

First release on npm. No code changes since 0.1.1.

- README: current status, tested versions, and a link to the upstream dev-mode issue.
- Package description no longer mentions Umami Cloud, which is still switched off.

## 0.1.1 (2026-10-28)

- Chart bars show real counts: pageviews and visitors are drawn over each other instead of
  stacked, which made each bar the sum of both.
- Chart x-axis labels follow the site's timezone and no longer repeat or overlap around the
  start of a month (seen on the 90-day range).
- Chart y-axis shows whole numbers only, so a range without data no longer reads 1, 1, 1, 0, 0, 0.
- The chart has a legend for the two series.

## 0.1.0 (2026-09-28)

First version.

- Analytics page in the EmDash admin, with KPI tiles compared against the previous period,
  active visitors, a pageviews and visitors chart, and top pages, referrers, countries,
  browsers, operating systems, devices and events. Ranges are 24 hours, 7, 30 and 90 days.
- Dashboard widget with the last 7 days and a sparkline.
- Guided settings for self-hosted Umami, with API key or username and password sign-in, a
  connection test and a website picker that includes team-shared sites.
- Umami Cloud support is implemented but disabled (shown as "coming in 0.2.0") until it has
  been tested against a Cloud account.
- Optional tracker injection into public pages through `page:fragments`.
- Statistics cached in plugin storage, with the saved copy shown when Umami is unreachable.
