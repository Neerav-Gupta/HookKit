# @hookkit-dev/adapter-next

HookKit's Next.js adapter gives you raw-body capture, drop-in production
verification, and a test target for App Router route handlers.

## Install

```bash
npm install @hookkit-dev/adapter-next
# add @hookkit-dev/sdk too if you're using it in tests (see below)
```

## Use it in production — edge-portable

`verifyRouteHandler()` uses the standard Web Crypto API unconditionally
(never `node:crypto`), so the same route works whether it declares
`export const runtime = "nodejs"` or `"edge"`:

```ts
// app/api/webhooks/stripe/route.ts
import { verifyRouteHandler } from "@hookkit-dev/adapter-next";

export const POST = verifyRouteHandler(
  "stripe",
  {
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
    idempotency: store, // any IdempotencyStore — in-memory, Redis, Postgres
    idempotencyKey: (evt) => (evt as { id: string }).id,
  },
  (request, event) => {
    // already verified AND deduped — `event` is the parsed body
    return Response.json({ received: true });
  },
);
```

Rejections respond with a generic 400 and never leak *why* to the client;
pass `onRejected(reason)` to log the real reason server-side. The `request`
passed to your handler has already had its body consumed (to verify it) — use
the `event` parameter instead of re-reading `request.json()`.

## Use it in tests

```ts
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-next";
import { POST } from "./route";

const target = toTarget(POST, "/api/webhooks/stripe");
```

The adapter keeps the raw request body intact so signature checks use the exact
bytes your app received.
