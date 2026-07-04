# HookKit

**An offline, open-source, all-in-one webhook dev + test kit for JS/TS.**
Three co-equal surfaces over one shared core: a test-native **SDK**, a dev
**CLI**, and a local **inspector**.

- **Offline-first.** Core, SDK, and CLI work with zero network access. No
  account, no API keys, no telemetry, no HookKit-operated servers — ever.
- **Provider-accurate signing.** Every generated event verifies against the
  provider's *official* verification library (enforced by golden tests).
- **Raw-body fidelity.** The exact bytes are the source of truth end to end;
  payloads are never re-serialized before signing or delivery.

Providers out of the box: **Stripe, GitHub, Shopify, Slack, Standard Webhooks.**

> npm scope note: packages live under `@hookkit-dev` (the `@hookkit` scope was
> taken). The CLI binary is still `hookkit`.

## 1 — Test SDK (`@hookkit-dev/sdk`)

```ts
import "@hookkit-dev/sdk/vitest";           // registers matchers
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-express";
import { createApp } from "../src/app";

const stripe = hookkit.stripe({ secret: "whsec_test" });
const target = toTarget(createApp(), "/webhooks/stripe");

it("accepts a valid event", async () => {
  const res = await stripe.event("checkout.session.completed").sendTo(target);
  expect(res).toBeAccepted();
});

it("rejects a tampered signature", async () => {
  const res = await stripe
    .event("checkout.session.completed")
    .tamperSignature()
    .sendTo(target);
  expect(res).toHaveRejectedWithStatus(400);
});

// correctness harness: duplicates, retries, ordering, malformed requests
const report = await hookkit.harness.idempotency(
  stripe.event("checkout.session.completed"),
  target,
  { times: 3 },
);
expect(report.pass).toBe(true);
```

Adapters guarantee raw-body fidelity per framework:
`@hookkit-dev/adapter-express`, `-fastify`, `-next`, `-hono`, `-nest`.

## 2 — CLI (`@hookkit-dev/cli`)

```bash
hookkit list providers
hookkit list events stripe
hookkit trigger stripe checkout.session.completed \
  --to http://localhost:3000/webhooks/stripe --secret whsec_test \
  --set data.object.amount_total=4242
hookkit verify stripe --body @body.json --header "Stripe-Signature: t=…,v1=…" --secret whsec_test
hookkit replay capture.json --to http://localhost:3000/webhooks/stripe
hookkit listen 3000 --tunnel cloudflared --path /webhooks/stripe   # real events, YOUR tunnel
hookkit inspect                                                    # launches the inspector
```

Config resolution: flags → `hookkit.config.{js,mjs,json,ts}` → env
(`HOOKKIT_STRIPE_SECRET`, `HOOKKIT_SECRET`, `HOOKKIT_TARGET`). Secrets are
never logged or written to disk.

## 3 — Inspector (`@hookkit-dev/inspector`)

```bash
hookkit inspect          # http://127.0.0.1:4000
```

Create endpoints, point webhooks at `/in/<slug>`, and get: live capture (SSE),
pretty-printed JSON, provider guess + signature badge (set
`HOOKKIT_<PROVIDER>_SECRET` for live verification), and exact-bytes
replay/forward to any local URL. Binds `127.0.0.1` by default; non-loopback
hosts require basic auth. Self-hostable via `packages/inspector/Dockerfile`.

## Receiving real provider events

No hosted relay — bring your own tunnel (`hookkit listen … --tunnel
cloudflared|ngrok|frpc`) or deploy the optional, user-self-hosted
[`@hookkit-dev/relay`](packages/relay/README.md). See [docs/listen.md](docs/listen.md).

## Development

```bash
pnpm install
pnpm verify        # biome + typecheck + vitest + build — must be green
```

Monorepo layout: `packages/{core,fixtures,sdk,cli,inspector,relay,adapter-*}`,
`examples/{express-stripe,fastify-shopify,next-github,hono-slack}`.
Adding a provider: [docs/adding-a-provider.md](docs/adding-a-provider.md).

## License

MIT. Fixtures contain synthetic data only.
