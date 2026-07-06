/**
 * Inspector capture server. Binds 127.0.0.1 by default; any non-loopback host
 * REQUIRES basic auth (NO-CLOUD invariant: this is a local tool, and exposing
 * it must be an explicit, authenticated choice).
 */
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ServerType, serve } from "@hono/node-server";
import { detectSchemaDrift, dispatch, registry } from "@hookkit-dev/core";
import { addFixture } from "@hookkit-dev/fixtures";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { streamSSE } from "hono/streaming";
import { InspectorDb, type RequestRow } from "./db.js";

export interface InspectorOptions {
	db?: InspectorDb;
	host?: string;
	port?: number;
	/** "user:pass" — required when host is not loopback. */
	auth?: string;
	/** Per-provider secrets for live signature verification of captures. */
	secrets?: Record<string, string>;
}

/** Guess the provider of a captured request from its signature headers. */
export function guessProvider(headers: Record<string, string>): string {
	const lower = new Set(Object.keys(headers).map((key) => key.toLowerCase()));
	for (const adapter of registry.list()) {
		if (lower.has(adapter.signatureHeader.toLowerCase())) return adapter.id;
	}
	return "";
}

function isLoopback(host: string): boolean {
	return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

export interface CaptureEvent {
	type: "request";
	request: Omit<RequestRow, "body_blob"> & { body_preview: string };
}

function toWire(row: RequestRow): CaptureEvent["request"] {
	const { body_blob, ...rest } = row;
	return { ...rest, body_preview: body_blob.toString("utf8").slice(0, 2048) };
}

/**
 * Computed live on read (no SQLite migration — keeps the §8 schema as-is):
 * does this captured request still match the JSON Schema HookKit knows for
 * its event type? `undefined` when the provider is unknown or the body isn't
 * JSON — not every capture is drift-checkable.
 */
function computeSchemaDrift(
	row: RequestRow,
): ReturnType<typeof detectSchemaDrift> | undefined {
	if (!row.provider_guess || !registry.has(row.provider_guess))
		return undefined;
	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(row.body_blob.toString("utf8"));
	} catch {
		return undefined;
	}
	const headers = JSON.parse(row.headers_json) as Record<string, string>;
	return detectSchemaDrift(row.provider_guess, { headers, parsedBody });
}

export function createInspectorApp(options: InspectorOptions = {}): {
	app: Hono;
	db: InspectorDb;
	events: EventEmitter;
} {
	const db = options.db ?? new InspectorDb();
	const events = new EventEmitter();
	events.setMaxListeners(100);
	const app = new Hono();

	const host = options.host ?? "127.0.0.1";
	if (!isLoopback(host)) {
		if (!options.auth?.includes(":")) {
			throw new Error(
				`refusing to bind non-loopback host ${host} without basic auth. ` +
					`Pass --auth user:pass (or HOOKKIT_INSPECTOR_AUTH).`,
			);
		}
		const [username, ...rest] = options.auth.split(":");
		app.use(
			"*",
			basicAuth({ username: username ?? "", password: rest.join(":") }),
		);
		console.warn(
			`⚠ inspector bound to ${host} (not loopback). Basic auth is enforced; anyone with the credentials can read captured webhooks.`,
		);
	}

	// ── capture ────────────────────────────────────────────────────────────
	app.all("/in/:slug", async (c) => {
		const endpoint = db.endpointBySlug(c.req.param("slug"));
		if (!endpoint) return c.json({ error: "unknown endpoint" }, 404);

		const rawBody = Buffer.from(await c.req.arrayBuffer());
		const headers: Record<string, string> = {};
		for (const [key, value] of c.req.raw.headers.entries())
			headers[key] = value;

		const provider = guessProvider(headers);
		let signatureStatus = "unknown";
		if (provider) {
			const secret =
				options.secrets?.[provider] ??
				process.env[
					`HOOKKIT_${provider.toUpperCase().replaceAll("-", "_")}_SECRET`
				];
			signatureStatus = secret
				? registry.get(provider).verify({ rawBody, headers, secret }).valid
					? "valid"
					: "invalid"
				: "unverified";
		}

		const row = db.insertRequest({
			endpoint_id: endpoint.id,
			method: c.req.method,
			headers_json: JSON.stringify(headers),
			body_blob: rawBody,
			query_json: JSON.stringify(c.req.query()),
			source_ip: c.req.header("x-forwarded-for") ?? "127.0.0.1",
			received_at: Date.now(),
			signature_status: signatureStatus,
			provider_guess: provider,
		});
		events.emit("capture", {
			type: "request",
			request: toWire(row),
		} satisfies CaptureEvent);
		return c.json({ ok: true, id: row.id });
	});

	// ── API ────────────────────────────────────────────────────────────────
	app.get("/api/endpoints", (c) => c.json(db.listEndpoints()));

	app.post("/api/endpoints", async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as { name?: string };
		const endpoint = db.createEndpoint(body.name ?? "webhook endpoint");
		return c.json(endpoint, 201);
	});

	app.get("/api/endpoints/:id/requests", (c) => {
		const rows = db.listRequests(c.req.param("id"));
		return c.json(rows.map(toWire));
	});

	app.get("/api/requests/:id", (c) => {
		const row = db.requestById(c.req.param("id"));
		if (!row) return c.json({ error: "not found" }, 404);
		return c.json({
			...toWire(row),
			body: row.body_blob.toString("utf8"),
			body_base64: row.body_blob.toString("base64"),
			replays: db.listReplays(row.id),
			schema_drift: computeSchemaDrift(row),
		});
	});

	// Capture → fixture loop: save a real captured request as a fixture. If
	// the event type is already known to the provider's adapter (e.g. a new
	// API-version variant of an existing event), it's immediately usable via
	// trigger/replay with no code changes; a genuinely new event type still
	// needs one manual step (registering it in the adapter's events map).
	// Shares its manifest-writing logic with `hookkit fixtures add` via
	// @hookkit-dev/fixtures.
	app.post("/api/requests/:id/save-fixture", async (c) => {
		const row = db.requestById(c.req.param("id"));
		if (!row) return c.json({ error: "not found" }, 404);
		const body = (await c.req.json().catch(() => ({}))) as {
			provider?: string;
			eventType?: string;
			apiVersion?: string;
		};
		if (!body.provider || !body.eventType) {
			return c.json({ error: "provider and eventType are required" }, 400);
		}
		const result = addFixture(body.provider, body.eventType, {
			rawBody: row.body_blob,
			...(body.apiVersion ? { apiVersion: body.apiVersion } : {}),
		});
		if (result.alreadyExisted) {
			return c.json(
				{
					error: `fixture ${result.fixtureId}@${result.apiVersion} already exists`,
				},
				409,
			);
		}
		const readyToUse =
			registry.has(body.provider) &&
			body.eventType in registry.get(body.provider).events;
		return c.json({ ...result, readyToUse }, 201);
	});

	// Replay/forward the EXACT captured bytes to a target URL.
	app.post("/api/requests/:id/replay", async (c) => {
		const row = db.requestById(c.req.param("id"));
		if (!row) return c.json({ error: "not found" }, 404);
		const { targetUrl } = (await c.req.json()) as { targetUrl?: string };
		if (!targetUrl) return c.json({ error: "targetUrl required" }, 400);

		const headers = JSON.parse(row.headers_json) as Record<string, string>;
		// Hop-by-hop / transport headers are recomputed by fetch.
		for (const name of ["host", "content-length", "connection"])
			delete headers[name];
		try {
			const result = await dispatch(
				{
					rawBody: row.body_blob,
					headers,
					parsed: undefined,
					eventType: "replay",
					provider: row.provider_guess || "replay",
				},
				targetUrl,
			);
			const replay = db.insertReplay({
				request_id: row.id,
				target_url: targetUrl,
				status: result.status,
				response_ms: Math.round(result.ms),
			});
			return c.json({ ...replay, response_body: result.body.slice(0, 2048) });
		} catch (err) {
			return c.json({ error: (err as Error).message }, 502);
		}
	});

	// ── live updates (SSE) ─────────────────────────────────────────────────
	app.get("/events/stream", (c) =>
		streamSSE(c, async (stream) => {
			let alive = true;
			const onCapture = (event: CaptureEvent) => {
				void stream.writeSSE({ event: "capture", data: JSON.stringify(event) });
			};
			events.on("capture", onCapture);
			stream.onAbort(() => {
				alive = false;
				events.off("capture", onCapture);
			});
			while (alive) {
				await stream.writeSSE({ event: "ping", data: String(Date.now()) });
				await stream.sleep(15000);
			}
		}),
	);

	// ── static UI (built by Vite into dist-ui/) ────────────────────────────
	const uiRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "dist-ui");
	const MIME: Record<string, string> = {
		".html": "text/html; charset=utf-8",
		".js": "text/javascript; charset=utf-8",
		".css": "text/css; charset=utf-8",
		".svg": "image/svg+xml",
		".ico": "image/x-icon",
	};
	app.get("/*", async (c) => {
		if (!existsSync(uiRoot)) {
			return c.text("hookkit inspector API is running (UI assets not built)");
		}
		const requested = c.req.path === "/" ? "/index.html" : c.req.path;
		// Path segments are normalized; refuse anything that escapes the root.
		const filePath = join(
			uiRoot,
			...requested.split("/").filter((s) => s && s !== ".."),
		);
		const servePath = existsSync(filePath)
			? filePath
			: join(uiRoot, "index.html");
		const { readFile } = await import("node:fs/promises");
		const ext = servePath.slice(servePath.lastIndexOf("."));
		const bytes = await readFile(servePath);
		return c.body(new Uint8Array(bytes), 200, {
			"Content-Type": MIME[ext] ?? "application/octet-stream",
		});
	});

	return { app, db, events };
}

export function startInspector(options: InspectorOptions = {}): {
	server: ServerType;
	db: InspectorDb;
	url: string;
} {
	const host = options.host ?? "127.0.0.1";
	const port = options.port ?? 4000;
	const { app, db } = createInspectorApp(options);
	const server = serve({ fetch: app.fetch, hostname: host, port });
	const url = `http://${host}:${port}`;
	console.log(`hookkit inspector listening on ${url}`);
	console.log(
		`create an endpoint:  curl -X POST ${url}/api/endpoints -d '{"name":"dev"}'`,
	);
	return { server, db, url };
}
