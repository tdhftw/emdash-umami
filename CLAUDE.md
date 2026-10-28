# @tdhftw/emdash-plugin-umami

Native EmDash plugin that shows Umami analytics in the EmDash admin. See `PLAN.md` for status.

## Working rules

- Native plugin, not sandboxed. `definePlugin()` in `src/index.ts` owns capabilities, the
  settings schema, routes and hooks. `src/admin/index.tsx` ships as source and exports
  `pages` and `widgets`.
- Check the EmDash docs (`https://docs.emdashcms.com/llms.txt`) before relying on the plugin API.
- Umami API reference: `https://docs.umami.is/docs/api`.
- No host-context hooks in admin components (the admin's Lingui or React Query). Under
  `astro dev` they resolve to a different module copy and crash. Wrap exports with
  `withQueryClient()`.
- Don't throw `PluginRouteError` for expected failures. Validate in the Zod `input` or return
  `{ ok: false, code, message }`.
- Credentials never appear in logs, error messages, KV values other than the short-lived
  `state:token`, or test fixtures.
- Test in a real site by installing a packed tarball (`npm pack`), never a linked folder.
- Every change ends with `npm run typecheck`, `npm test` and `npm run build` passing.

## Commands

```bash
npm run dev        # tsdown --watch (server entry only; admin ships as source)
npm run build      # dist/
npm test           # vitest
npm run typecheck  # tsc --noEmit
```
