# @hookkit-dev/adapter-hono

HookKit's Hono adapter gives you raw-body capture, drop-in production
verification, and a test target for a Hono app.

## Install

```bash
npm install @hookkit-dev/adapter-hono hono
# add @hookkit-dev/sdk too if you're using it in tests (see below)
```

## Use it in production — edge-portable

`verifyMiddleware()` uses the standard Web Crypto API unconditionally (never
`node:crypto`), so it runs identically on **Node, Cloudflare Workers, Vercel
Edge, and Deno Deploy** — no runtime detection, no separate code path:

```ts
import { verifyMiddleware } from "@hookkit-dev/adapter-hono";

app.post(
  "/webhooks/stripe",
  verifyMiddleware("stripe", {
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
    idempotency: store, // any IdempotencyStore — in-memory, Redis, Postgres
    idempotencyKey: (evt) => (evt as { id: string }).id,
  }),
  (c) => {
    const event = c.get("hookkitEvent"); // already verified AND deduped
    return c.json({ received: true });
  },
);
```

Rejections respond with a generic 400 and never leak *why* to the client;
pass `onRejected(reason)` to log the real reason server-side.

## Use it in tests

```ts
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-hono";

const target = toTarget(app, "/webhooks/stripe");
```

The adapter keeps the raw request body intact so signature checks use the exact
bytes your app received.
