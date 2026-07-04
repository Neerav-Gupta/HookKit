/**
 * Docker / standalone entry. Non-loopback binds require HOOKKIT_INSPECTOR_AUTH
 * (user:pass) — the server refuses to start without it.
 */
import { InspectorDb } from "./db.js";
import { startInspector } from "./server.js";

const host = process.env.HOOKKIT_INSPECTOR_HOST ?? "127.0.0.1";
const port = Number(process.env.HOOKKIT_INSPECTOR_PORT ?? 4000);
const auth = process.env.HOOKKIT_INSPECTOR_AUTH;
const dbPath = process.env.HOOKKIT_INSPECTOR_DB ?? "/data/inspector.sqlite";

startInspector({
	host,
	port,
	...(auth ? { auth } : {}),
	db: new InspectorDb(dbPath),
});
