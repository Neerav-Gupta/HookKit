# @hookkit-dev/core

The core package holds HookKit's provider registry, signing logic, event
generation, dispatching, and harness utilities.

## Install

```bash
npm install @hookkit-dev/core
```

## What it provides

- provider registration and lookup,
- raw-body-safe event generation,
- provider signature creation and verification,
- dispatch to URLs or framework apps,
- conformance and harness helpers.

## Example

```ts
import { generate, dispatch, registry } from "@hookkit-dev/core";

const event = generate("stripe", "checkout.session.completed", {
  secret: "whsec_test",
  timestamp: 1710000000,
});

await dispatch(event, "http://localhost:3000/webhooks/stripe");

const provider = registry.get("stripe");
```
