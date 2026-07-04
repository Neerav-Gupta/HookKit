# @hookkit-dev/adapter-fastify

HookKit's Fastify adapter gives you raw-body capture and a test target for a
Fastify app.

## Install

```bash
npm install @hookkit-dev/adapter-fastify @hookkit-dev/sdk
```

## Use it in tests

```ts
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-fastify";

const target = toTarget(app, "/webhooks/stripe");
```

The adapter keeps the raw request body intact so signature checks use the exact
bytes your app received.
