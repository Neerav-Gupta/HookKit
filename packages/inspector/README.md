# @hookkit-dev/inspector

The inspector gives you a local UI for webhook traffic. It captures incoming
requests, shows the raw payload and headers, guesses the provider, and lets you
replay or forward the exact bytes.

## Install

```bash
npm install @hookkit-dev/inspector
```

## Start it

```bash
hookkit inspect
```

By default it binds to `127.0.0.1` on port `4000`.

## What it does

- captures requests at `POST /in/<slug>`,
- shows live updates through SSE,
- verifies signatures when you provide `HOOKKIT_<PROVIDER>_SECRET`,
- replays or forwards the exact raw bytes to another local URL.

## Public bind

If you bind the inspector to a non-loopback host, basic auth is required.
See the Dockerfile for running it in a container.
