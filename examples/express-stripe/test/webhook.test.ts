import "@hookkit-dev/sdk/vitest";
import { toTarget } from "@hookkit-dev/adapter-express";
import { hookkit } from "@hookkit-dev/sdk";
import { describe, expect, it } from "vitest";
import { createApp, WEBHOOK_SECRET } from "../src/app.ts";

const target = toTarget(createApp(), "/webhooks/stripe");
const stripe = hookkit.stripe({ secret: WEBHOOK_SECRET });

describe("express-stripe example", () => {
	it("accepts a HookKit-generated event via the official stripe middleware", async () => {
		const res = await stripe.event("checkout.session.completed").sendTo(target);
		expect(res).toBeAccepted();
		expect(JSON.parse(res.body)).toEqual({
			received: true,
			type: "checkout.session.completed",
		});
	});

	it("rejects a tampered signature with 400", async () => {
		const res = await stripe
			.event("checkout.session.completed")
			.tamperSignature()
			.sendTo(target);
		expect(res).toHaveRejectedWithStatus(400);
	});

	it("rejects a stale timestamp with 400", async () => {
		const res = await stripe
			.event("checkout.session.completed")
			.withTimestamp(Math.floor(Date.now() / 1000) - 3600)
			.sendTo(target);
		expect(res).toHaveRejectedWithStatus(400);
	});
});
