# @hookkit-dev/fixtures

HookKit fixtures are bundled synthetic payloads for the supported providers.
They are versioned, stored as exact bytes, and loaded as Buffers.

## Install

```bash
npm install @hookkit-dev/fixtures
```

## Use it

```ts
import { getFixture } from "@hookkit-dev/fixtures";

const fixture = getFixture("stripe/checkout.session.completed");
```

## What to expect

- no real PII, tokens, or secrets,
- a manifest that maps fixture ids to files,
- raw bytes preserved end to end.

Use `hookkit fixtures add <provider> <event>` to scaffold a new synthetic
fixture.
