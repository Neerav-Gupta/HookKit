# Receiving real provider events: `hookkit listen`

Use `hookkit listen` when you want Stripe, GitHub, Shopify, or another provider
to send real webhooks to your local machine.

HookKit does not run a hosted relay. You either bring your own tunnel or run
the optional self-hosted relay package.

## Option 1: use your own tunnel

```bash
export HOOKKIT_STRIPE_SECRET=whsec_...
hookkit listen 3000 --tunnel cloudflared --path /webhooks/stripe
```

`hookkit listen` starts a local capture server and prints a public URL. Point
your provider webhook settings at that URL, and HookKit forwards each delivery
byte-for-byte to your local app.

You can also use `ngrok` or `frpc` if those are already installed on your
machine.

## Option 2: run the optional relay

If you want a stable public URL that you control, deploy the relay package on a
host you own and connect your machine outbound to it.

```bash
pnpm --filter @hookkit-dev/relay build
docker build -t hookkit-relay packages/relay
docker run -p 8787:8787 -e RELAY_TOKENS=<long-random-token> hookkit-relay
```

Then connect your machine:

```bash
hookkit-relay-client wss://relay.example.com <long-random-token> http://127.0.0.1:3000
```

Providers then POST to the relay URL, and the relay forwards the exact bytes
to your local app.

## Quick check

1. Start your app on `http://localhost:3000`.
2. Run `hookkit listen 3000 --tunnel cloudflared --path /webhooks/stripe`.
3. Send a test webhook from the provider dashboard.
4. Confirm the request is captured and forwarded to your app.
