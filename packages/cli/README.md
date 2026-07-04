# @hookkit-dev/cli

The `hookkit` command line tool is for day-to-day webhook work. Use it to
generate events, verify signatures, replay captured requests, listen for real
provider deliveries, and open the local inspector.

## Install

```bash
npm install @hookkit-dev/cli
```

## Commands

- `hookkit trigger` generates and sends a signed event.
- `hookkit verify` checks a raw body and signature header.
- `hookkit replay` re-delivers a captured request.
- `hookkit list` shows providers or events.
- `hookkit listen` opens a local capture endpoint behind your tunnel.
- `hookkit inspect` starts the local inspector UI.
- `hookkit fixtures add` scaffolds a new synthetic fixture.

## Examples

```bash
hookkit trigger stripe checkout.session.completed --to http://localhost:3000/webhooks/stripe --secret whsec_test
hookkit verify github --body @payload.json --header "X-Hub-Signature-256: sha256=…" --secret s
hookkit listen 3000 --tunnel cloudflared --path /webhooks/stripe
hookkit inspect
```

## Config

The CLI reads secrets from flags first, then from `hookkit.config.*`, then
from environment variables. Secrets are never logged.
