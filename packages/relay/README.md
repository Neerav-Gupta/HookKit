# @hookkit-dev/relay

OPTIONAL, USER-self-hosted relay — HookKit never operates one. Gives you a
stable public URL that forwards to your machine over an OUTBOUND WebSocket
(no inbound ports on your laptop).

```bash
# on your host
docker build -t hookkit-relay packages/relay   # after: pnpm --filter @hookkit-dev/relay build
docker run -p 8787:8787 -e RELAY_TOKENS=<long-random-token> hookkit-relay

# on your dev machine
hookkit-relay-client wss://relay.example.com <long-random-token> http://127.0.0.1:3000
```

Providers POST to `https://relay.example.com/hook/<token>/<path>`; bytes are
relayed exactly and your local handler's response is returned to the provider.
