/**
 * Reference Hono + Slack webhook handler. Verifies the request exactly as
 * Slack's docs prescribe: HMAC over `v0:{timestamp}:{raw body}` with a
 * constant-time compare and a 5-minute replay window.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { rawBody } from "@hookkit-dev/adapter-hono";
import { Hono } from "hono";

export const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? "slack_test";

export function createApp(): Hono {
	const app = new Hono();

	app.post("/webhooks/slack", async (c) => {
		const signature = c.req.header("x-slack-signature");
		const timestampHeader = c.req.header("x-slack-request-timestamp");
		if (!signature || !timestampHeader) {
			return c.json({ error: "missing Slack signature headers" }, 400);
		}
		const timestamp = Number(timestampHeader);
		if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
			return c.json({ error: "timestamp outside tolerance" }, 401);
		}
		const body = await rawBody(c);
		const base = `v0:${timestamp}:${body.toString("utf8")}`;
		const expected = `v0=${createHmac("sha256", SIGNING_SECRET).update(base).digest("hex")}`;
		const valid =
			expected.length === signature.length &&
			timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
		if (!valid) {
			return c.json({ error: "invalid signature" }, 401);
		}
		const payload = JSON.parse(body.toString("utf8")) as {
			event?: { type?: string };
		};
		console.log(`verified slack event: ${payload.event?.type}`);
		return c.json({ received: true, eventType: payload.event?.type });
	});

	return app;
}
