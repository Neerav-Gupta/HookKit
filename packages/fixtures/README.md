# @hookkit-dev/fixtures

Bundled, versioned, SYNTHETIC webhook payloads plus a manifest
(`fixtureId → apiVersion → file`). The fixture file's exact bytes are the
source of truth — loaded as Buffers, never re-serialized.

```ts
import { getFixture, listFixtures } from "@hookkit-dev/fixtures";
const { rawBody, apiVersion } = getFixture("stripe/checkout.session.completed");
```

No real PII, tokens, or secrets — enforced by review + the fixture-schema CI
gate in @hookkit-dev/core. Scaffold new fixtures with
`hookkit fixtures add <provider> <event>`.
