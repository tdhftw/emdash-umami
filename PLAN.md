# Plan

## Status

0.1.x: self-hosted Umami, an Analytics page, a dashboard widget and optional tracker injection.
Umami Cloud support is written but switched off (`CLOUD_ENABLED = false`).

## Next

- **0.2.0, Umami Cloud.** Test the Cloud client against a real Cloud account, fix what turns up,
  then switch Cloud on.
- Submit the plugin to awesome-emdash.

## Release checklist

1. `npm run typecheck`, `npm test` and `npm run build` pass.
2. Bump the version in `package.json` and `PLUGIN_VERSION` in `src/shared/constants.ts`.
3. Add a `CHANGELOG.md` entry.
4. Commit, tag `vX.Y.Z`, push, then `npm publish`.
