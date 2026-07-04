# @hookkit-dev/adapter-next

HookKit's Next.js adapter gives you raw-body capture and a test target for App
Router route handlers.

## Install

```bash
npm install @hookkit-dev/adapter-next @hookkit-dev/sdk
```

## Use it in tests

```ts
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-next";
import { POST } from "./route";

const target = toTarget(POST, "/api/webhooks/stripe");
```

The adapter keeps the raw request body intact so signature checks use the exact
bytes your app received.
