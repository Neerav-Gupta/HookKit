import "@hookkit-dev/sdk/vitest";
import { toTarget } from "@hookkit-dev/adapter-next";
import { hookkit } from "@hookkit-dev/sdk";
import { describe, expect, it } from "vitest";
import { POST, WEBHOOK_SECRET } from "../app/api/webhooks/github/route.ts";

const target = toTarget(POST);
const github = hookkit.github({ secret: WEBHOOK_SECRET });

describe("next-github example", () => {
	it("accepts a HookKit-generated event via the official octokit verifier", async () => {
		const res = await github.event("push").sendTo(target);
		expect(res).toBeAccepted();
		expect(JSON.parse(res.body)).toEqual({ received: true, event: "push" });
	});

	it("rejects a tampered signature with 401", async () => {
		const res = await github.event("push").tamperSignature().sendTo(target);
		expect(res).toHaveRejectedWithStatus(401);
	});
});
