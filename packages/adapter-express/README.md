# @hookkit-dev/adapter-express

HookKit's Express adapter gives you raw-body capture, drop-in production
verification middleware, and a test target for an Express app.

## Install

```bash
npm install @hookkit-dev/adapter-express
# add @hookkit-dev/sdk too if you're using it in tests (see below)
```

## Use it in production

Before:
```ts
app.post("/webhooks/stripe", rawBodyMiddleware(), (req, res) => {
  const signature = req.headers["stripe-signature"];
  try {
    const event = Stripe.webhooks.constructEvent(req.rawBody, signature, secret);
    // ...now handle the event, and hope you also remembered to dedupe it
  } catch {
    res.status(400).end();
  }
});
```

After:
```ts
import { verifyMiddleware, type VerifiedIncomingMessage } from "@hookkit-dev/adapter-express";

app.post(
  "/webhooks/stripe",
  verifyMiddleware("stripe", {
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
    idempotency: store, // any IdempotencyStore — in-memory, Redis, Postgres
    idempotencyKey: (evt) => (evt as { id: string }).id,
  }),
  (req, res) => {
    const event = (req as VerifiedIncomingMessage).hookkitEvent;
    // already verified AND deduped — just handle it
    res.status(200).json({ received: true });
  },
);
```

Rejections respond with a generic 400 and never leak *why* to the client;
pass `onRejected(reason)` to log the real reason server-side.

## Use it in tests

```ts
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-express";

const target = toTarget(app, "/webhooks/stripe");
const result = await hookkit.stripe({ secret }).event("checkout.session.completed").sendTo(target);
```

The adapter keeps the raw request body intact so signature checks use the exact
bytes your app received.
