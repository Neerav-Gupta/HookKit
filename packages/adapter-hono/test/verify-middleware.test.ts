import { generate, InMemoryIdempotencyStore } from "@hookkit-dev/core";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { toTarget, verifyMiddleware } from "../src/index.js";

const secret = "whsec_verify_middleware_test";

function buildApp(opts: Parameters<typeof verifyMiddleware>[1] = { secret }) {
	const app = new Hono();
	app.post("/webhooks/stripe", verifyMiddleware("stripe", opts), (c) => {
		return c.json({ received: true, event: c.get("hookkitEvent") });
	});
	return app;
}

describe("adapter-hono verifyMiddleware (Web Crypto, edge-portable)", () => {
	it("accepts a validly signed event and exposes hookkitEvent to the handler", async () => {
		const target = toTarget(buildApp(), "/webhooks/stripe");
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const res = await target.inject({
			method: "POST",
			url: "/webhooks/stripe",
			headers: evt.headers,
			body: evt.rawBody,
		});
		expect(res.status).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.received).toBe(true);
		expect(body.event.type).toBe("checkout.session.completed");
	});

	it("rejects a tampered signature with a generic 400", async () => {
		const target = toTarget(buildApp(), "/webhooks/stripe");
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const tampered = Buffer.concat([evt.rawBody, Buffer.from(" ")]);
		const res = await target.inject({
			method: "POST",
			url: "/webhooks/stripe",
			headers: evt.headers,
			body: tampered,
		});
		expect(res.status).toBe(400);
		expect(JSON.parse(res.body)).toEqual({ error: "invalid signature" });
	});

	it("calls onRejected with the real reason for server-side logging only", async () => {
		const reasons: (string | undefined)[] = [];
		const target = toTarget(
			buildApp({ secret, onRejected: (reason) => reasons.push(reason) }),
			"/webhooks/stripe",
		);
		const evt = generate("stripe", "checkout.session.completed", {
			secret: "wrong-secret",
		});
		await target.inject({
			method: "POST",
			url: "/webhooks/stripe",
			headers: evt.headers,
			body: evt.rawBody,
		});
		expect(reasons).toHaveLength(1);
		expect(reasons[0]).toBeTruthy();
	});

	it("dedupes a repeated event via idempotency, acking 200 without re-invoking the handler logic", async () => {
		const idempotency = new InMemoryIdempotencyStore();
		let handlerCalls = 0;
		const app = new Hono();
		app.post(
			"/webhooks/stripe",
			verifyMiddleware("stripe", {
				secret,
				idempotency,
				idempotencyKey: (parsed) => (parsed as { id: string }).id,
			}),
			(c) => {
				handlerCalls++;
				return c.json({ received: true });
			},
		);
		const target = toTarget(app, "/webhooks/stripe");
		const evt = generate("stripe", "checkout.session.completed", { secret });

		const first = await target.inject({
			method: "POST",
			url: "/webhooks/stripe",
			headers: evt.headers,
			body: evt.rawBody,
		});
		const second = await target.inject({
			method: "POST",
			url: "/webhooks/stripe",
			headers: evt.headers,
			body: evt.rawBody,
		});

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(JSON.parse(second.body)).toEqual({
			received: true,
			duplicate: true,
		});
		expect(handlerCalls).toBe(1); // the second delivery never reached the handler
	});
});
