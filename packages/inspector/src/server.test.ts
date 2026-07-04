import { createServer } from "node:http";
import { generate } from "@hookkit-dev/core";
import { afterAll, describe, expect, it } from "vitest";
import { InspectorDb } from "./db.js";
import { createInspectorApp, guessProvider } from "./server.js";

const secret = "whsec_inspector_test";
const { app, db, events } = createInspectorApp({
	db: new InspectorDb(":memory:"),
	secrets: { stripe: secret },
});

// Loopback receiver for replay tests.
const replayed: Buffer[] = [];
const receiver = createServer((req, res) => {
	const chunks: Buffer[] = [];
	req.on("data", (chunk) => chunks.push(chunk));
	req.on("end", () => {
		replayed.push(Buffer.concat(chunks));
		res.statusCode = 200;
		res.end("ok");
	});
});
await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
const addr = receiver.address();
const receiverUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;

afterAll(() => {
	db.close();
	return new Promise<void>((resolve) => receiver.close(() => resolve()));
});

async function createEndpoint(): Promise<{ id: string; slug: string }> {
	const res = await app.request("/api/endpoints", {
		method: "POST",
		body: JSON.stringify({ name: "test" }),
	});
	expect(res.status).toBe(201);
	return (await res.json()) as { id: string; slug: string };
}

describe("inspector capture", () => {
	it("captures the exact bytes and verifies the signature live", async () => {
		const endpoint = await createEndpoint();
		const evt = generate("stripe", "checkout.session.completed", { secret });

		const captureEvents: unknown[] = [];
		events.on("capture", (e) => captureEvents.push(e));

		const res = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(evt.rawBody),
		});
		expect(res.status).toBe(200);
		const { id } = (await res.json()) as { id: string };

		const row = db.requestById(id);
		expect(row?.body_blob.equals(evt.rawBody)).toBe(true); // raw-body fidelity
		expect(row?.provider_guess).toBe("stripe");
		expect(row?.signature_status).toBe("valid");
		expect(captureEvents).toHaveLength(1); // SSE broadcast fired
	});

	it("flags a tampered capture as invalid", async () => {
		const endpoint = await createEndpoint();
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const res = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(Buffer.concat([evt.rawBody, Buffer.from(" ")])),
		});
		const { id } = (await res.json()) as { id: string };
		expect(db.requestById(id)?.signature_status).toBe("invalid");
	});

	it("404s on unknown endpoints", async () => {
		const res = await app.request("/in/nope", { method: "POST", body: "{}" });
		expect(res.status).toBe(404);
	});

	it("guesses providers from signature headers", () => {
		expect(guessProvider({ "Stripe-Signature": "t=1,v1=x" })).toBe("stripe");
		expect(guessProvider({ "x-hub-signature-256": "sha256=x" })).toBe("github");
		expect(guessProvider({ "x-plain": "1" })).toBe("");
	});
});

describe("inspector replay", () => {
	it("replays the exact captured bytes to a target", async () => {
		const endpoint = await createEndpoint();
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const captureRes = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(evt.rawBody),
		});
		const { id } = (await captureRes.json()) as { id: string };

		replayed.length = 0;
		const replayRes = await app.request(`/api/requests/${id}/replay`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ targetUrl: receiverUrl }),
		});
		expect(replayRes.status).toBe(200);
		const replay = (await replayRes.json()) as { status: number };
		expect(replay.status).toBe(200);
		expect(replayed[0]?.equals(evt.rawBody)).toBe(true);
		expect(db.listReplays(id)).toHaveLength(1);
	});
});

describe("inspector security", () => {
	it("refuses non-loopback binds without basic auth", () => {
		expect(() =>
			createInspectorApp({ db: new InspectorDb(":memory:"), host: "0.0.0.0" }),
		).toThrow(/basic auth/);
	});

	it("enforces basic auth on non-loopback binds", async () => {
		const guarded = createInspectorApp({
			db: new InspectorDb(":memory:"),
			host: "0.0.0.0",
			auth: "user:pass",
		});
		const denied = await guarded.app.request("/api/endpoints");
		expect(denied.status).toBe(401);
		const allowed = await guarded.app.request("/api/endpoints", {
			headers: {
				Authorization: `Basic ${Buffer.from("user:pass").toString("base64")}`,
			},
		});
		expect(allowed.status).toBe(200);
	});
});
