# @hookkit-dev/cli

## 0.1.0

### Minor Changes

- Cross from "test tool" to "production primitive."

  - **Drop-in verify middleware** for Express, Fastify, Hono, and Next.js.
    `adapter-hono`/`adapter-next` use the standard Web Crypto API
    unconditionally (never `node:crypto`), so they run unmodified on Node,
    Cloudflare Workers, Vercel Edge, and Deno Deploy; `adapter-express`/
    `adapter-fastify` stay on the faster sync `node:crypto` path.
  - **Idempotency stores**: a single atomic `checkAndSet()` primitive
    (`IdempotencyStore`), an in-memory implementation in `@hookkit-dev/core`,
    and two new packages — `@hookkit-dev/idempotency-redis` and
    `@hookkit-dev/idempotency-postgres` — wireable into the verify middleware
    in one step.
  - **Two new providers**: Discord (Ed25519, golden-tested against the
    official `discord-interactions` library) and GitLab (static shared-secret
    token — the one documented exception to "verify against an official
    library," since none exists for a scheme this simple). Plus SDK aliases
    (`hookkit.clerk()`/`resend()`/`polar()`) for Svix/Standard-Webhooks-powered
    services.
  - **Runtime schema-drift detection**: `detectSchemaDrift()` flags when a real
    payload no longer matches the JSON Schema HookKit knows for that event —
    surfaced as a badge in the inspector and a non-fatal warning in
    `hookkit verify`.
  - **Capture → fixture → replay loop**: the inspector's "Save as fixture"
    button (and `hookkit fixtures save-from-inspector`) turns a real captured
    request into a fixture usable immediately via `trigger`/replay.

  No breaking changes — every addition is additive (new exports, new optional
  adapter fields, new packages).

### Patch Changes

- Updated dependencies
  - @hookkit-dev/fixtures@0.1.0
  - @hookkit-dev/inspector@0.1.0

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
  - @hookkit-dev/fixtures@0.0.3
  - @hookkit-dev/inspector@0.0.3
