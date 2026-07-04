import "@hookkit-dev/sdk/vitest";
import { toTarget } from "@hookkit-dev/adapter-hono";
import { hookkit } from "@hookkit-dev/sdk";
import { describe, expect, it } from "vitest";
import { createApp, SIGNING_SECRET } from "../src/app.ts";

const target = toTarget(createApp(), "/webhooks/slack");
const slack = hookkit.slack({ secret: SIGNING_SECRET });

describe("hono-slack example", () => {
	it("accepts a HookKit-generated event via documented Slack verification", async () => {
		const res = await slack.event("app_mention").sendTo(target);
		expect(res).toBeAccepted();
		expect(JSON.parse(res.body)).toEqual({
			received: true,
			eventType: "app_mention",
		});
	});

	it("rejects a tampered signature with 401", async () => {
		const res = await slack
			.event("app_mention")
			.tamperSignature()
			.sendTo(target);
		expect(res).toHaveRejectedWithStatus(401);
	});

	it("rejects a stale timestamp with 401 (replay window)", async () => {
		const res = await slack
			.event("app_mention")
			.withTimestamp(Math.floor(Date.now() / 1000) - 3600)
			.sendTo(target);
		expect(res).toHaveRejectedWithStatus(401);
	});
});
