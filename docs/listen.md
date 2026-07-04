# Receiving real provider events: `hookkit listen`

HookKit never operates a hosted relay (see CLAUDE.md invariants). To receive a
*real* provider event on your machine you bring your own public path:

## Option A — bring-your-own tunnel (default)

```bash
# your app runs on :3000; cloudflared is installed and on your PATH
export HOOKKIT_STRIPE_SECRET=whsec_…       # enables live verification logging
hookkit listen 3000 --tunnel cloudflared --path /webhooks/stripe
```

`hookkit listen` starts a local capture server, shells out to
`cloudflared tunnel --url http://127.0.0.1:<capture-port>`, and prints the
public `https://….trycloudflare.com` URL. Point the provider's webhook
settings at that URL; every delivery is logged (provider guess + signature
verdict) and forwarded byte-for-byte to `http://127.0.0.1:3000/webhooks/stripe`.

`--tunnel ngrok` and `--tunnel frpc` work the same way with your own binaries.

## Manual acceptance check (M5)

1. `pnpm --filter example-express-stripe start` (listens on :3000)
2. `hookkit listen 3000 --tunnel cloudflared --path /webhooks/stripe`
3. Copy the printed public URL, then from ANY external machine:
   `curl -X POST https://<public-url>/ -d '{"probe":true}'`
4. Observe the capture log line and the forwarded request hitting the example
   app (400 for the unsigned probe — verification middleware is working; a
   Stripe CLI test event with your real `whsec_…` secret returns 200).

## Option B — self-hosted relay (`@hookkit-dev/relay`)

Deploy the relay image on YOUR host for a stable public URL:

```bash
pnpm --filter @hookkit-dev/relay build
docker build -t hookkit-relay packages/relay
docker run -p 8787:8787 -e RELAY_TOKENS=<long-random-token> hookkit-relay
```

On your dev machine, connect outbound (no inbound ports needed):

```bash
hookkit-relay-client wss://relay.example.com <long-random-token> http://127.0.0.1:3000
```

Providers then POST to `https://relay.example.com/hook/<token>/webhooks/stripe`.
