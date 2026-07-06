# @hookkit-dev/idempotency-postgres

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
  - @hookkit-dev/core@0.1.0
