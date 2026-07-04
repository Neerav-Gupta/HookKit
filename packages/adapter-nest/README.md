# @hookkit-dev/adapter-nest

HookKit's Nest adapter gives you raw-body capture and a test target for a Nest
application.

## Install

```bash
npm install @hookkit-dev/adapter-nest @hookkit-dev/sdk
```

## Use it in tests

```ts
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-nest";

const target = toTarget(app, "/webhooks/stripe");
```

The adapter keeps the raw request body intact so signature checks use the exact
bytes your app received.
