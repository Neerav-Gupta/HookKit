# @hookkit-dev/inspector

## 0.0.3

### Patch Changes

- Fix the publish pipeline so packages actually work when installed.

  0.0.2 was published with plain `npm publish`, which does not apply
  `publishConfig` overrides or rewrite `workspace:*` ranges. As a result every
  published package pointed `main`/`exports` at TypeScript source instead of
  the built `dist/` output, and every package depending on another
  `@hookkit-dev/*` package listed it as `workspace:*` — an unresolvable range
  outside this monorepo, making `npm install`/`pnpm add` fail outright for
  `core`, `sdk`, `cli`, `inspector`, and all `adapter-*` packages.

  `scripts/publish-packages.mjs` now publishes with `pnpm publish`, which
  performs both transforms correctly. No code behavior changes.

- Updated dependencies
  - @hookkit-dev/core@0.0.3
