# @hookkit-dev/sdk

Test-native surface over @hookkit-dev/core: provider-scoped builders, delivery
to URLs or framework apps, failure-path mutators, vitest/jest matchers, and
the correctness harness.

```ts
import "@hookkit-dev/sdk/vitest";
import { hookkit } from "@hookkit-dev/sdk";

const stripe = hookkit.stripe({ secret });
await stripe.event("checkout.session.completed").sendTo(target);      // 2xx
await stripe.event("checkout.session.completed").tamperSignature().sendTo(target); // 4xx
await hookkit.harness.malformed(stripe.event("checkout.session.completed"), target, { kind: "expiredTimestamp" });
```

Matchers: `toBeAccepted()`, `toHaveRejectedWithStatus(status)`.
