# @hookkit-dev/adapter-express

HookKit's Express adapter gives you raw-body capture and a test target for an
Express app.

## Install

```bash
npm install @hookkit-dev/adapter-express @hookkit-dev/sdk
```

## Use it in tests

```ts
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-express";

const target = toTarget(app, "/webhooks/stripe");
const result = await hookkit.stripe({ secret }).event("checkout.session.completed").sendTo(target);
```

The adapter keeps the raw request body intact so signature checks use the exact
bytes your app received.
