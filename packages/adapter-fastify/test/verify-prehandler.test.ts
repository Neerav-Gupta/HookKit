import { generate, InMemoryIdempotencyStore } from "@hookkit-dev/core";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerRawBody, toTarget, verifyPreHandler } from "../src/index.js";

const secret = "whsec_verify_prehandler_test";

function buildApp(opts: Parameters<typeof verifyPreHandler>[1] = { secret }) {
	const app = Fastify();
	registerRawBody(app);
	app.post(
		"/webhooks/stripe",
		{ preHandler: verifyPreHandler("stripe", opts) },
		(request, reply) => {
			return reply
				.status(200)
				.send({ received: true, event: request.hookkitEvent });
		},
	);
	return app;
}

describe("adapter-fastify verifyPreHandler", () => {
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
		expect((body.event as { type: string }).type).toBe(
			"checkout.session.completed",
		);
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
		const app = Fastify();
		registerRawBody(app);
		app.post(
			"/webhooks/stripe",
			{
				preHandler: verifyPreHandler("stripe", {
					secret,
					idempotency,
					idempotencyKey: (parsed) => (parsed as { id: string }).id,
				}),
			},
			(_request, reply) => {
				handlerCalls++;
				return reply.status(200).send({ received: true });
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
