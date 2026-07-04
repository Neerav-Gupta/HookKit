import { createServer } from "node:http";
import { afterAll, describe, expect, it } from "vitest";
import { connectRelay } from "./client.js";
import { startRelayServer } from "./server.js";

// Full loop, all on loopback: provider → relay server → WS → client → local app.
const relay = startRelayServer({
	port: 0,
	host: "127.0.0.1",
	tokens: ["test-token"],
	log: () => {},
});
await new Promise((resolve) => setTimeout(resolve, 50));
const relayUrl = `http://127.0.0.1:${relay.port()}`;

const received: { rawBody: Buffer; path: string }[] = [];
const app = createServer((req, res) => {
	const chunks: Buffer[] = [];
	req.on("data", (chunk) => chunks.push(chunk));
	req.on("end", () => {
		received.push({ rawBody: Buffer.concat(chunks), path: req.url ?? "" });
		res.statusCode = 200;
		res.setHeader("content-type", "application/json");
		res.end(JSON.stringify({ ok: true }));
	});
});
await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
const appAddress = app.address();
const appUrl = `http://127.0.0.1:${typeof appAddress === "object" && appAddress ? appAddress.port : 0}`;

const client = connectRelay({
	relayUrl,
	token: "test-token",
	forwardTo: appUrl,
	reconnect: false,
	log: () => {},
});
await client.ready;

afterAll(async () => {
	client.stop();
	await relay.stop();
	await new Promise<void>((resolve) => app.close(() => resolve()));
});

describe("self-hosted relay", () => {
	it("relays a request end-to-end with exact bytes", async () => {
		const body = Buffer.from(
			JSON.stringify({ id: "evt_1", padding: "π≠ascii" }),
		);
		received.length = 0;
		const res = await fetch(`${relayUrl}/hook/test-token/webhooks/stripe`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: new Uint8Array(body),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(received[0]?.rawBody.equals(body)).toBe(true); // raw-body fidelity
		expect(received[0]?.path).toBe("/webhooks/stripe");
	});

	it("502s for tokens with no connected client", async () => {
		const res = await fetch(`${relayUrl}/hook/other-token/x`, {
			method: "POST",
			body: "{}",
		});
		expect(res.status).toBe(502);
	});

	it("rejects unknown tokens at the allowlist", async () => {
		const res = await fetch(`${relayUrl}/hook/not-allowed/x`, {
			method: "POST",
			body: "{}",
		});
		expect(res.status).toBe(502);
	});

	it("healthz responds", async () => {
		const res = await fetch(`${relayUrl}/healthz`);
		expect(res.status).toBe(200);
	});
});
