# @hookkit-dev/sdk

The SDK is the testing surface for HookKit. It generates signed webhook events,
sends them to your app, and gives you matchers and harness helpers for common
failure cases.

## Install

```bash
npm install @hookkit-dev/sdk
```

## Use it in tests

```ts
import "@hookkit-dev/sdk/vitest";
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-express";

const stripe = hookkit.stripe({ secret: "whsec_test" });
const target = toTarget(app, "/webhooks/stripe");

const result = await stripe.event("checkout.session.completed").sendTo(target);
expect(result).toBeAccepted();

const rejected = await stripe.event("checkout.session.completed").tamperSignature().sendTo(target);
expect(rejected).toHaveRejectedWithStatus(400);
```

## Harness helpers

Use the harness when you want to test retries, duplicate delivery, ordering, or
malformed requests:

```ts
await hookkit.harness.malformed(stripe.event("checkout.session.completed"), target, {
	kind: "expiredTimestamp",
});
```

Matchers: `toBeAccepted()` and `toHaveRejectedWithStatus(status)`.
