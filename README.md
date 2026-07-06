# HookKit

HookKit is an offline-first webhook toolkit for JS and TS — both a test kit
and a production dependency. It gives you:

- a test SDK for generating and asserting webhook deliveries,
- drop-in signature-verification middleware for Express, Fastify, Hono, and
  Next.js (the Hono and Next.js versions run unmodified on Cloudflare
  Workers, Vercel Edge, and Deno Deploy),
- an idempotency store (in-memory, Redis, Postgres) built on a single atomic
  primitive, wired into the middleware in one step,
- a CLI for triggering, verifying, replaying, and listening for events,
- a local inspector for capturing and replaying webhook traffic — with a
  one-click "save as fixture" that turns a real captured event into something
  you replay in CI,
- runtime schema-drift detection, so you find out when a provider's real
  payload has quietly diverged from what your code expects.

HookKit works with published npm packages under the `@hookkit-dev` scope. The
CLI binary is `hookkit`.

## Install

Choose the packages you need:

```bash
npm install @hookkit-dev/sdk @hookkit-dev/adapter-express
npm install @hookkit-dev/cli
npm install @hookkit-dev/inspector
```

Supported providers out of the box: Stripe, GitHub, Shopify, Slack, Discord,
GitLab, and Standard Webhooks — which also covers any Svix-powered service
(Clerk, Resend, Polar, and others, as of this writing) via `hookkit.clerk(…)`/
`hookkit.resend(…)`/`hookkit.polar(…)` or `hookkit.standardWebhooks(…)`.

## Use it in production

Drop-in verify middleware replaces the raw signature-check boilerplate you'd
otherwise copy-paste per provider — and optionally dedupes in the same step:

```ts
// Next.js App Router — app/api/webhooks/stripe/route.ts
import { verifyRouteHandler } from "@hookkit-dev/adapter-next";
import { RedisIdempotencyStore } from "@hookkit-dev/idempotency-redis";

const store = new RedisIdempotencyStore(redis);

export const POST = verifyRouteHandler(
  "stripe",
  {
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
    idempotency: store,
    idempotencyKey: (evt) => (evt as { id: string }).id,
  },
  (request, event) => {
    // already verified AND deduped
    return Response.json({ received: true });
  },
);
```

`adapter-hono` and `adapter-next` use the standard Web Crypto API
unconditionally (never `node:crypto`), so the same handler runs on Node,
Cloudflare Workers, Vercel Edge, and Deno Deploy with no changes.
`adapter-express`/`adapter-fastify` give you the same shape on the faster,
simpler `node:crypto` path for Node-only servers. See each adapter's README.

## Use it in tests

HookKit does not run in the browser. You use it around the webhook endpoint
behind your app, such as a Next.js route or an Express API.

Example with a React app that uses an Express backend:

```ts
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-express";

const stripe = hookkit.stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! });
const target = toTarget(app, "/webhooks/stripe"); // your Express app instance

const result = await stripe.event("checkout.session.completed").sendTo(target);
expect(result).toBeAccepted();
```

Use the CLI when you want to work with a local endpoint directly:

```bash
hookkit trigger stripe checkout.session.completed \
  --to http://localhost:3000/webhooks/stripe \
  --secret whsec_test

hookkit verify github \
  --body @payload.json \
  --header "X-Hub-Signature-256: sha256=…" \
  --secret github_test
```

## Inspector

Run the inspector when you want to capture, inspect, and replay webhook
requests locally:

```bash
hookkit inspect
```

The inspector listens on `127.0.0.1` by default. If you bind it to a public
host, basic auth is required. Each captured request shows a live signature
badge and a schema-drift badge (does the real payload still match the schema
HookKit knows for that event?). Click "Save as fixture" — or run
`hookkit fixtures save-from-inspector <requestId> --provider <p> --event <e>`
— to turn a real captured event into a fixture you can replay in CI; a new
API-version variant of an event HookKit already knows works immediately,
with zero code changes.

## Receive real provider events locally

Use `hookkit listen` with your own tunnel, or deploy the optional
user-self-hosted relay package.

```bash
hookkit listen 3000 --tunnel cloudflared --path /webhooks/stripe
```

See [docs/listen.md](docs/listen.md) for the full flow.

## Package overview

- `@hookkit-dev/sdk` for tests and matchers
- `@hookkit-dev/cli` for command-line workflows
- `@hookkit-dev/inspector` for the local UI and capture server
- `@hookkit-dev/adapter-*` for framework integration and production verify middleware
- `@hookkit-dev/idempotency-redis` / `@hookkit-dev/idempotency-postgres` for
  production idempotency stores (an in-memory one ships in core)
- `@hookkit-dev/core` for signing, generation, dispatching, and schema-drift detection
- `@hookkit-dev/fixtures` for synthetic payloads
- `@hookkit-dev/relay` for the optional self-hosted relay

See [docs/roadmap.md](docs/roadmap.md) for what's next (more frameworks,
typed payloads, an MCP server, distribution tooling, more providers).

## Publishing

If you are maintaining this repo, build first and then publish the packages in
order:

```bash
pnpm build
pnpm publish:packages:dry-run
pnpm publish:packages
```

## License

MIT. Fixtures contain synthetic data only.
