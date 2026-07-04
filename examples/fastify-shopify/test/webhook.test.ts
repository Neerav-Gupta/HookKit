import "@hookkit-dev/sdk/vitest";
import { toTarget } from "@hookkit-dev/adapter-fastify";
import { hookkit } from "@hookkit-dev/sdk";
import { describe, expect, it } from "vitest";
import { createApp, WEBHOOK_SECRET } from "../src/app.ts";

const target = toTarget(createApp(), "/webhooks/shopify");
const shopify = hookkit.shopify({ secret: WEBHOOK_SECRET });

describe("fastify-shopify example", () => {
	it("accepts a HookKit-generated event via documented HMAC verification", async () => {
		const res = await shopify.event("orders/create").sendTo(target);
		expect(res).toBeAccepted();
		expect(JSON.parse(res.body)).toEqual({
			received: true,
			topic: "orders/create",
		});
	});

	it("rejects a tampered signature with 401", async () => {
		const res = await shopify
			.event("orders/create")
			.tamperSignature()
			.sendTo(target);
		expect(res).toHaveRejectedWithStatus(401);
	});
});
