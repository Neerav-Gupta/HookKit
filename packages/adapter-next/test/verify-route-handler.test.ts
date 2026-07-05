import { generate, InMemoryIdempotencyStore } from "@hookkit-dev/core";
import { describe, expect, it } from "vitest";
import { toTarget, verifyRouteHandler } from "../src/index.js";

const secret = "whsec_verify_route_handler_test";

function buildHandler(
	opts: Parameters<typeof verifyRouteHandler>[1] = { secret },
) {
	return verifyRouteHandler("stripe", opts, (_request, event) => {
		return Response.json({ received: true, event });
	});
}

describe("adapter-next verifyRouteHandler (Web Crypto, edge-portable)", () => {
	it("accepts a validly signed event and passes the parsed event to the handler", async () => {
		const target = toTarget(buildHandler(), "/webhooks/stripe");
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
		const target = toTarget(buildHandler(), "/webhooks/stripe");
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
			buildHandler({ secret, onRejected: (reason) => reasons.push(reason) }),
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
		const handler = verifyRouteHandler(
			"stripe",
			{
				secret,
				idempotency,
				idempotencyKey: (parsed) => (parsed as { id: string }).id,
			},
			() => {
				handlerCalls++;
				return Response.json({ received: true });
			},
		);
		const target = toTarget(handler, "/webhooks/stripe");
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
