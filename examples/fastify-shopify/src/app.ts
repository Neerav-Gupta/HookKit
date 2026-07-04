/**
 * Reference Fastify + Shopify webhook handler. Verifies the HMAC exactly as
 * Shopify's docs prescribe: base64(hmac-sha256(secret, raw bytes)) compared
 * in constant time — against the raw bytes captured by the adapter.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { registerRawBody } from "@hookkit-dev/adapter-fastify";
import Fastify, { type FastifyInstance } from "fastify";

export const WEBHOOK_SECRET =
	process.env.SHOPIFY_WEBHOOK_SECRET ?? "shpss_test";

export function createApp(): FastifyInstance {
	const app = Fastify();
	registerRawBody(app);

	app.post("/webhooks/shopify", (request, reply) => {
		const hmacHeader = request.headers["x-shopify-hmac-sha256"];
		const rawBody = request.rawBody;
		if (typeof hmacHeader !== "string" || !rawBody) {
			return reply
				.status(400)
				.send({ error: "missing X-Shopify-Hmac-Sha256 or raw body" });
		}
		const digest = createHmac("sha256", WEBHOOK_SECRET)
			.update(rawBody)
			.digest();
		const provided = Buffer.from(hmacHeader, "base64");
		const valid =
			digest.length === provided.length && timingSafeEqual(digest, provided);
		if (!valid) {
			return reply.status(401).send({ error: "invalid HMAC" });
		}
		const topic = request.headers["x-shopify-topic"];
		request.log.info(`verified shopify webhook: ${topic}`);
		return reply.status(200).send({ received: true, topic });
	});

	return app;
}
