# @hookkit-dev/inspector

Local webhook inspector: Hono capture server + better-sqlite3 + React UI.
Capture endpoints (`POST /in/<slug>`), live SSE updates, provider guess +
signature badge, pretty JSON, and exact-bytes replay/forward.

```bash
hookkit inspect        # http://127.0.0.1:4000
```

Binds `127.0.0.1` by default. Non-loopback binds REQUIRE basic auth
(`--auth user:pass` / `HOOKKIT_INSPECTOR_AUTH`). Set
`HOOKKIT_<PROVIDER>_SECRET` to verify captures live. Docker: see Dockerfile
(build after `pnpm build`).
