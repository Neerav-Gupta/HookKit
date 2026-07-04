# @hookkit-dev/cli

The `hookkit` binary: `trigger`, `replay`, `list`, `verify`, `listen`
(BYO tunnel), `inspect` (launches the local inspector), and `fixtures add`
(contributor scaffolder). Fully offline by default; talks only to URLs you
pass. Secrets come from flags → `hookkit.config.*` → env and are never logged.

```bash
hookkit trigger stripe checkout.session.completed --to http://localhost:3000/webhooks/stripe --secret whsec_test
hookkit verify github --body @payload.json --header "X-Hub-Signature-256: sha256=…" --secret s
hookkit listen 3000 --tunnel cloudflared --path /webhooks/stripe
```
