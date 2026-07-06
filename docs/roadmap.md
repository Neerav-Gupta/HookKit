# Roadmap / backlog

Items deliberately scoped out of the "production primitive" upgrade round
(verify middleware, idempotency stores, Discord/GitLab, Standard Webhooks
aliases, schema-drift detection, capture→fixture→replay). Each is
roughly its own M0–M6-sized effort. Notes below capture the technical
groundwork already done so a future session doesn't have to re-derive it.

## 1. Framework / runtime reach

SvelteKit, Nuxt/Nitro, Remix, AWS Lambda, Vercel/Netlify Functions, and
Cloudflare Workers as an explicit target (distinct from "Hono running on
Workers", which already works today — see below).

- **Template to follow**: `packages/adapter-hono` and `packages/adapter-next`
  already operate on Web-standard `Request`/`Response` and use the
  `verifyAsync()` (Web Crypto) path unconditionally — they're the reference
  for any framework whose handler shape is "receives a `Request`, returns a
  `Response`" (SvelteKit's `+server.ts`, Remix's resource routes, Nitro/Nuxt's
  event handlers with a small adapter). This should be mechanical repetition
  of the existing pattern, not new design.
- **Lambda/Netlify are a different shape.** Their handler signatures are
  event-object-based (API Gateway/ALB proxy event, or Netlify's `Handler`),
  not `Request`/`Response`. These need a translation layer (extract
  method/headers/body from the event shape, construct the equivalent inputs
  to `verifyAsync()`, translate the result back into the expected response
  shape) rather than reusing `adapter-hono`/`adapter-next` directly.
- **Bun/Deno for the CLI**: worth a compatibility pass (does
  `packages/cli/src/cli.ts`'s dynamic `import()` and
  `packages/fixtures/src/index.ts`'s `createRequire(...).resolve(...)`
  package-root detection work unmodified under Bun and Deno's Node
  compatibility layers?) — likely fine, not yet verified.

## 2. Typed event payload codegen

Ship per-provider TypeScript types for events (e.g. `StripeCheckoutSessionCompleted`).

- **Blocker**: current JSON Schemas in `packages/core/src/adapters/*.ts` have
  `required` arrays and top-level `properties` but leave nested objects loose
  (e.g. Stripe's `data.object` only declares `required`, no `properties` for
  the fields inside). Feeding these into `json-schema-to-typescript` today
  would produce interfaces full of untyped/`any` nested fields — not useful.
- **Prerequisite**: tighten the schemas (full `properties` at every level) —
  this is itself valuable independent of codegen, since it strengthens the
  fixture-schema CI gate and `detectSchemaDrift()` (`packages/core/src/schema-drift.ts`)
  introduced in this round.
- Once tightened, codegen tooling is a fairly mechanical follow-up: run
  `json-schema-to-typescript` over each `EventDescriptor.schema`, emit into a
  new `@hookkit-dev/types` package (or per-provider `.d.ts` files consumers
  can import), regenerate as part of `pnpm verify` or a dedicated script.

## 3. MCP server

Let AI coding agents trigger and inspect webhooks through HookKit.

- **SDK**: `@modelcontextprotocol/sdk` — `McpServer` for the server object,
  register **tools** for actions and **resources** for read-only data,
  transports include stdio and Streamable HTTP. Runs on Node/Bun/Deno.
- **Proposed shape**: new `packages/mcp-server`. Tools wrap
  `packages/cli/src/commands.ts`'s existing pure functions almost directly —
  `trigger`, `verify`, `listProviders`, `listEvents` are already
  side-effect-isolated and return a uniform `{ exitCode, output }` shape,
  easy to adapt into MCP tool results. Resources expose read-only inspector
  data (list captured requests, fetch one by id) by calling into
  `@hookkit-dev/inspector`'s `createInspectorApp()` in-process (no HTTP hop
  needed if the MCP server and inspector share a process; otherwise proxy to
  a running inspector's `/api/*` routes the same way
  `fixturesSaveFromInspector()` in `packages/cli/src/fixtures-cmd.ts` does).
- Stays consistent with the offline-first/no-telemetry invariants: the MCP
  server itself does nothing over the network except what the user's own
  `trigger`/`verify`/inspector calls already do.

## 4. Distribution: GitHub Action + compiled CLI binary + Homebrew

So Python/Go/Rails developers can use `trigger`/`inspect` without touching npm.

- **Compiled binary options compared:**
  - **Node SEA** (Single Executable Applications) — official Node answer;
    bundles a copy of the Node binary with the app blob injected via
    `postject`. Full native-module compatibility (matters for
    `better-sqlite3` in the inspector). Current limitation: CommonJS only.
  - **Bun compile** (`bun build --compile`) — smallest/fastest output, but
    it's a runtime swap, not just a packaging step; needs its own
    compatibility pass.
  - **Deno compile** — bundles the Deno runtime; good cross-platform/cross-
    compile story, less natural fit for an npm-native project.
  - **Recommendation**: start with Node SEA — it's the least risky given the
    existing Node-only assumptions elsewhere in the CLI/inspector.
- **Real compatibility risk to test early**: the CLI's lazy dynamic
  `import()` calls (`packages/cli/src/cli.ts` — `fixtures-cmd.js`,
  `listen.js`, `@hookkit-dev/inspector`) and
  `packages/fixtures/src/index.ts`'s `createRequire(import.meta.url).resolve(...)`
  package-root detection both assume a real `node_modules` resolution
  context. SEA's blob-injection model may or may not preserve that — verify
  with a minimal SEA build of just `hookkit list providers` before
  committing to the approach for the full CLI.
- **GitHub Action**: mostly composition — a `action.yml` that installs/runs
  the CLI and executes `hookkit trigger`/`verify` against a matrix of
  fixtures as a contract-test step. Low effort once the distribution story
  is settled (can ship against the npm package before the compiled binary
  exists).

## 5. Non-JSON-bodied providers

`packages/core/src/generate.ts` unconditionally does
`JSON.parse(fixture.rawBody.toString("utf8"))` for the `parsed` convenience
field (and when applying overrides) — this breaks for providers whose real
wire format isn't JSON (Twilio's webhooks are
`application/x-www-form-urlencoded`; some legacy providers use XML).

- **Fix needed**: a `contentType`-conditional parse/serialize hook on
  `ProviderAdapter` (e.g. optional `parseBody`/`serializeBody` methods,
  defaulting to today's JSON behavior when absent) before any form-encoded
  or XML-bodied provider can be added correctly.
- This is a prerequisite for Twilio specifically (see the provider list
  below) and worth doing generically rather than special-casing Twilio.

## 6. Provider long tail

Each follows the existing `docs/adding-a-provider.md` process (golden test
first against the official verifier). Rough notes from this round's research:

- **PayPal** — real signature verification needs the sending certificate
  (fetched from a URL in the `PAYPAL-CERT-URL` header) plus RSA-SHA256 over
  the transmission headers + body. The cert-fetch step is network-dependent,
  which conflicts with OFFLINE-FIRST unless certs are pinned as fixtures —
  needs an explicit decision on how to stay offline (e.g. ship known PayPal
  sandbox certs as fixtures, refuse live cert-fetching entirely) before
  implementation starts.
- **Twilio** — HMAC-SHA1 over the full URL + sorted POST params, body is
  form-encoded (blocked on item 5 above).
- **SendGrid** — ECDSA (P-256) signature verification (Event Webhook Signed
  Verification); asymmetric like Discord, but a different curve/algorithm —
  `node:crypto`'s `sign`/`verify` support P-256 natively, so this should
  follow the same DER-wrapper pattern established for Discord's Ed25519 in
  `packages/core/src/adapters/discord.ts`, just with `prime256v1`/`P-256`
  instead of Ed25519's fixed OID.
- **Mailgun, Postmark, Paddle, Lemon Squeezy, Razorpay, Paystack, Mollie,
  Adyen** — not yet researched; each needs its actual signing recipe looked
  up from current provider docs before starting (do not assume schemes from
  memory — provider implementations do change).
