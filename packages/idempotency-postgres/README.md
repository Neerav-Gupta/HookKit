# @hookkit-dev/idempotency-postgres

Postgres-backed `IdempotencyStore` for HookKit's production verify middleware.
`checkAndSet()` is a single atomic upsert — no application-level locking
needed, Postgres's row-level locking on the unique index handles the race.

```ts
import { Pool } from "pg";
import { PostgresIdempotencyStore } from "@hookkit-dev/idempotency-postgres";

const store = new PostgresIdempotencyStore(new Pool({ connectionString: process.env.DATABASE_URL }));
await store.ensureSchema(); // once at startup

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

Call `store.pruneExpired()` on a cron to bound table growth — it's not
required for correctness, only for cleanup.

Tests need a real Postgres and skip cleanly if one isn't reachable:

```bash
docker run --rm -p 6543:5432 -e POSTGRES_PASSWORD=hookkit_test -e POSTGRES_DB=hookkit_test postgres:16-alpine
pnpm --filter @hookkit-dev/idempotency-postgres test
```
