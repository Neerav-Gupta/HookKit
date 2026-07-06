# HookKit

HookKit is an offline-first webhook toolkit for JS and TS. It gives you three
pieces you can use in your own app:

- a test SDK for generating and asserting webhook deliveries,
- a CLI for triggering, verifying, replaying, and listening for events,
- a local inspector for capturing and replaying webhook traffic.

HookKit works with published npm packages under the `@hookkit-dev` scope. The
CLI binary is `hookkit`.

## Install

Choose the packages you need:

```bash
npm install @hookkit-dev/sdk @hookkit-dev/adapter-express
npm install @hookkit-dev/cli
npm install @hookkit-dev/inspector
```

Supported providers out of the box: Stripe, GitHub, Shopify, Slack, Discord,
GitLab, and Standard Webhooks — which also covers any Svix-powered service
(Clerk, Resend, Polar, and others, as of this writing) via `hookkit.clerk(…)`/
`hookkit.resend(…)`/`hookkit.polar(…)` or `hookkit.standardWebhooks(…)`.

## Use in a React app

HookKit does not run in the browser. You use it around the webhook endpoint
behind your React app, such as a Next.js route or an Express API.

Example with a React app that uses an Express backend:

```ts
import { hookkit } from "@hookkit-dev/sdk";
import { toTarget } from "@hookkit-dev/adapter-express";

const stripe = hookkit.stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! });
const target = toTarget(app, "/webhooks/stripe"); // your Express app instance

const result = await stripe.event("checkout.session.completed").sendTo(target);
expect(result).toBeAccepted();
```

Use the CLI when you want to work with a local endpoint directly:

```bash
hookkit trigger stripe checkout.session.completed \
  --to http://localhost:3000/webhooks/stripe \
  --secret whsec_test

hookkit verify github \
  --body @payload.json \
  --header "X-Hub-Signature-256: sha256=…" \
  --secret github_test
```

## Inspector

Run the inspector when you want to capture, inspect, and replay webhook
requests locally:

```bash
hookkit inspect
```

The inspector listens on `127.0.0.1` by default. If you bind it to a public
host, basic auth is required.

## Receive real provider events locally

Use `hookkit listen` with your own tunnel, or deploy the optional
user-self-hosted relay package.

```bash
hookkit listen 3000 --tunnel cloudflared --path /webhooks/stripe
```

See [docs/listen.md](docs/listen.md) for the full flow.

## Package overview

- `@hookkit-dev/sdk` for tests and matchers
- `@hookkit-dev/cli` for command-line workflows
- `@hookkit-dev/inspector` for the local UI and capture server
- `@hookkit-dev/adapter-*` for framework integration
- `@hookkit-dev/core` for signing, generation, and dispatching
- `@hookkit-dev/fixtures` for synthetic payloads
- `@hookkit-dev/relay` for the optional self-hosted relay

## Publishing

If you are maintaining this repo, build first and then publish the packages in
order:

```bash
pnpm build
pnpm publish:packages:dry-run
pnpm publish:packages
```

## License

MIT. Fixtures contain synthetic data only.
