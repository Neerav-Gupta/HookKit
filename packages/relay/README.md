# @hookkit-dev/relay

The relay is an optional, user-self-hosted public entry point for local
webhook development. HookKit does not operate one for you.

## Install

```bash
npm install @hookkit-dev/relay
```

## How it works

The relay gives you a public URL, receives provider requests, and forwards the
exact bytes to your local machine over an outbound WebSocket.

## Run it

```bash
docker build -t hookkit-relay packages/relay
docker run -p 8787:8787 -e RELAY_TOKENS=<long-random-token> hookkit-relay
```

Then connect your machine:

```bash
hookkit-relay-client wss://relay.example.com <long-random-token> http://127.0.0.1:3000
```

Providers can then POST to the relay URL and your local handler receives the
request.
