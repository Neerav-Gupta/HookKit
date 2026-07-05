# @hookkit-dev/adapter-fastify

HookKit's Fastify adapter gives you raw-body capture, drop-in production
verification, and a test target for a Fastify app.

## Install

```bash
npm install @hookkit-dev/adapter-fastify
# add @hookkit-dev/sdk too if you're using it in tests (see below)
```

## Use it in production

```ts
import { registerRawBody, verifyPreHandler } from "@hookkit-dev/adapter-fastify";

registerRawBody(app); // once at app setup — Fastify's raw-body capture is app-level

app.post(
  "/webhooks/stripe",
  {
    preHandler: verifyPreHandler("stripe", {
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
      idempotency: store, // any IdempotencyStore — in-memory, Redis, Postgres
      idempotencyKey: (evt) => (evt as { id: string }).id,
    }),
  },
  (request, reply) => {
    const event = request.hookkitEvent; // already verified AND deduped
    return reply.status(200).send({ received: true });
  },
);
```

Rejections respond with a generic 400 and never leak *why* to the client;
pass `onRejected(reason)` to log the real reason server-side.

## Use it in tests

```ts
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-fastify";

const target = toTarget(app, "/webhooks/stripe");
```

The adapter keeps the raw request body intact so signature checks use the exact
bytes your app received.
