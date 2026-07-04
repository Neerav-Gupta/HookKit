import { createServer } from "node:http";
import { generate } from "@hookkit-dev/core";
import { afterAll, describe, expect, it } from "vitest";
import { startListen } from "./listen.js";

const secret = "whsec_listen_test";

// The user's local app: verifies Stripe signatures.
const received: Buffer[] = [];
const app = createServer((req, res) => {
	const chunks: Buffer[] = [];
	req.on("data", (chunk) => chunks.push(chunk));
	req.on("end", async () => {
		const rawBody = Buffer.concat(chunks);
		received.push(rawBody);
		const { registry } = await import("@hookkit-dev/core");
		const headers = Object.fromEntries(
			Object.entries(req.headers).map(([key, value]) => [key, String(value)]),
		);
		const result = registry.get("stripe").verify({ rawBody, headers, secret });
		res.statusCode = result.valid ? 200 : 400;
		res.end(JSON.stringify(result));
	});
});
await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
const appAddress = app.address();
const appPort =
	typeof appAddress === "object" && appAddress ? appAddress.port : 0;

const logs: string[] = [];
const handle = await startListen({
	port: appPort,
	path: "/webhooks/stripe",
	log: (line) => logs.push(line),
});

afterAll(async () => {
	await handle.stop();
	await new Promise<void>((resolve) => app.close(() => resolve()));
});

describe("hookkit listen (no tunnel — capture/verify/forward core)", () => {
	it("forwards the exact bytes and passes the handler's response through", async () => {
		const evt = generate("stripe", "checkout.session.completed", { secret });
		received.length = 0;
		const res = await fetch(handle.captureUrl, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(evt.rawBody),
		});
		expect(res.status).toBe(200);
		expect(received[0]?.equals(evt.rawBody)).toBe(true); // raw-body fidelity
		expect(logs.join("\n")).toContain("stripe");
	});

	it("passes through the handler's rejection of a tampered event", async () => {
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const res = await fetch(handle.captureUrl, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(Buffer.concat([evt.rawBody, Buffer.from(" ")])),
		});
		expect(res.status).toBe(400);
	});

	it("responds 502 when the local app is down", async () => {
		const orphan = await startListen({ port: 1, log: () => {} }); // nothing listens on port 1
		const res = await fetch(orphan.captureUrl, { method: "POST", body: "{}" });
		expect(res.status).toBe(502);
		await orphan.stop();
	});
});
