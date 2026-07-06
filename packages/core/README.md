# @hookkit-dev/core

The core package holds HookKit's provider registry, signing logic, event
generation, dispatching, and harness utilities.

## Install

```bash
npm install @hookkit-dev/core
```

## What it provides

- provider registration and lookup (Stripe, GitHub, Shopify, Slack, Discord,
  GitLab, Standard Webhooks),
- raw-body-safe event generation,
- provider signature creation and verification — a sync `node:crypto` path
  for testing, plus an optional async Web Crypto `verifyAsync()` used only by
  edge-targeting production middleware,
- dispatch to URLs or framework apps,
- conformance and harness helpers,
- an `IdempotencyStore` interface + in-memory implementation (Redis/Postgres
  ship as separate `@hookkit-dev/idempotency-*` packages),
- `detectSchemaDrift()` — does a real payload still match the JSON Schema
  HookKit knows for that event?

## Example

```ts
import { generate, dispatch, registry, detectSchemaDrift } from "@hookkit-dev/core";

const event = generate("stripe", "checkout.session.completed", {
  secret: "whsec_test",
  timestamp: 1710000000,
});

await dispatch(event, "http://localhost:3000/webhooks/stripe");

const provider = registry.get("stripe");

// Runtime drift check against a real received payload:
const drift = detectSchemaDrift("stripe", { headers, parsedBody });
if (drift.checked && !drift.matched) console.warn(drift.errors);
```
