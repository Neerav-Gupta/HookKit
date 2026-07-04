# Adding a provider

Everything a new provider needs lives in TWO packages: a fixture in
`@hookkit-dev/fixtures` and an adapter in `@hookkit-dev/core`. The SDK, CLI,
and inspector pick it up automatically from the registry — never duplicate
signing logic into a surface package (CLAUDE.md invariant).

Worked example: adding a fictional provider `acme` with event `order.shipped`.

## 1. Scaffold the fixture

```bash
pnpm --filter @hookkit-dev/cli build
node packages/cli/dist/cli.js fixtures add acme order.shipped --api-version v1
```

This creates `packages/fixtures/fixtures/acme/v1/order.shipped.json` and
registers `acme/order.shipped` in `packages/fixtures/manifest.json`. Fill the
file with a **synthetic** payload matching the provider's documented shape —
no real PII, tokens, or secrets, ever.

## 2. Write the adapter (test-first)

Create `packages/core/src/adapters/acme.golden.test.ts` FIRST. The golden test
generates an event and verifies it with the provider's **official**
verification library (added as a devDependency of core, used only as the
oracle). See `stripe.golden.test.ts` for the pattern. If the provider ships no
verifier library, implement the documented recipe independently in the test
(see the Slack/Shopify golden tests).

Then create `packages/core/src/adapters/acme.ts` implementing `ProviderAdapter`
from `../types.js`:

- `sign()` — compute the exact headers the real provider attaches to the raw
  bytes. Use ONLY the helpers in `../signature.js` (`node:crypto` — no
  third-party crypto).
- `verify()` — recompute and compare in constant time (`safeEqual`); enforce
  `toleranceSec` (default 300) if the scheme is timestamped.
- `headersFor()` (optional) — event-dependent realism headers such as
  GitHub's `X-GitHub-Event`.
- `events` — one `EventDescriptor` per event: `fixtureId` (`acme/order.shipped`),
  `apiVersions`, and a JSON `schema` (drives the fixture CI gate).
- `retryPolicy` — the provider's documented redelivery behavior.

NEVER re-serialize a payload before signing: `sign()` receives the raw bytes
and must use them as-is.

## 3. Register it

In `packages/core/src/registry.ts`:

```ts
import { acme } from "./adapters/acme.js";
registry.register(acme);
```

Export it from `packages/core/src/index.ts`, and add the id to
`EXPECTED_PROVIDERS` in `packages/core/src/conformance.test.ts`.

## 4. Prove it

```bash
pnpm --filter @hookkit-dev/core test
```

This runs, for your adapter, automatically:

- your golden test against the official verifier (provider-accurate signing),
- the shared conformance suite (`conformance.ts`): metadata, fixture
  resolution, sign→verify round-trip per event, tamper rejection, wrong-secret
  rejection, missing-header rejection, stale-timestamp rejection, determinism,
- the fixture-schema CI gate (`fixtures.schema.test.ts`): every fixture must
  satisfy your event schema — a malformed fixture fails CI.

A provider is DONE when `pnpm verify` is green with all of the above. Optional
polish: add the provider to the SDK convenience methods
(`packages/sdk/src/index.ts`) — `hookkit.provider("acme", …)` already works
without it.
