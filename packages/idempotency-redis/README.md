# @hookkit-dev/idempotency-redis

Redis-backed `IdempotencyStore` for HookKit's production verify middleware.
Uses `SET key 1 NX EX ttl` — atomic in Redis itself, so `checkAndSet()` needs
no additional locking.

```ts
import Redis from "ioredis";
import { RedisIdempotencyStore } from "@hookkit-dev/idempotency-redis";

const store = new RedisIdempotencyStore(new Redis(process.env.REDIS_URL));

app.post(
  "/webhooks/stripe",
  verifyMiddleware("stripe", {
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
    idempotency: store,
    idempotencyKey: (evt) => evt.id,
  }),
  handler,
);
```

Tests need a real Redis and skip cleanly if one isn't reachable:

```bash
docker run --rm -p 6399:6379 redis:7-alpine
pnpm --filter @hookkit-dev/idempotency-redis test
```
