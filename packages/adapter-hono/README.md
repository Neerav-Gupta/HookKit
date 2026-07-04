# @hookkit-dev/adapter-hono

HookKit's Hono adapter gives you raw-body capture and a test target for a Hono
app.

## Install

```bash
npm install @hookkit-dev/adapter-hono @hookkit-dev/sdk hono
```

## Use it in tests

```ts
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-hono";

const target = toTarget(app, "/webhooks/stripe");
```

The adapter keeps the raw request body intact so signature checks use the exact
bytes your app received.
