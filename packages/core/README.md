# @hookkit-dev/core

The single source of provider truth: `ProviderRegistry`, signature engine
(`node:crypto` only), `generate()` (fixture → signed event, raw-body
faithful), `dispatch()` (URL or FrameworkApp), the correctness `harness`, and
the shared conformance suite every adapter must pass.

```ts
import { generate, dispatch, registry, harness } from "@hookkit-dev/core";

const evt = generate("stripe", "checkout.session.completed", {
  secret: "whsec_test",
  timestamp: 1710000000,          // pin for determinism
  overrides: { data: { object: { amount_total: 4242 } } },
});
await dispatch(evt, "http://localhost:3000/webhooks/stripe");

registry.get("stripe").verify({ rawBody, headers, secret }); // { valid, reason? }
```

Offline-first: no network in any default path. Every provider is golden-tested
against its official verification library. See `docs/adding-a-provider.md`.
