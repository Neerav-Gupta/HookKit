import { createHash } from "node:crypto";
import { getHeader, hmacSha256Base64, safeEqual } from "../signature.js";
import { hmacSha256Base64Web, safeEqualWeb } from "../signature-web.js";
import type { ProviderAdapter } from "../types.js";

const API_VERSION = "2025-04";

/**
 * Shopify webhook signing (https://shopify.dev/docs/apps/build/webhooks):
 *   X-Shopify-Hmac-Sha256: base64( hmac-sha256(secret, rawBody) )
 * No timestamp in the scheme.
 */
export const shopify: ProviderAdapter = {
	id: "shopify",
	displayName: "Shopify",
	contentType: "application/json",
	signatureHeader: "X-Shopify-Hmac-Sha256",

	sign({ rawBody, secret }) {
		return { "X-Shopify-Hmac-Sha256": hmacSha256Base64(secret, rawBody) };
	},

	verify({ rawBody, headers, secret }) {
		const header = getHeader(headers, "X-Shopify-Hmac-Sha256");
		if (!header) {
			return { valid: false, reason: "missing X-Shopify-Hmac-Sha256 header" };
		}
		const expected = hmacSha256Base64(secret, rawBody);
		return safeEqual(header, expected)
			? { valid: true }
			: { valid: false, reason: "signature mismatch" };
	},

	async verifyAsync({ rawBody, headers, secret }) {
		const header = getHeader(headers, "X-Shopify-Hmac-Sha256");
		if (!header) {
			return { valid: false, reason: "missing X-Shopify-Hmac-Sha256 header" };
		}
		const expected = await hmacSha256Base64Web(secret, rawBody);
		return safeEqualWeb(header, expected)
			? { valid: true }
			: { valid: false, reason: "signature mismatch" };
	},

	headersFor({ eventType, rawBody, apiVersion }) {
		const digest = createHash("sha256").update(rawBody).digest("hex");
		return {
			"X-Shopify-Topic": eventType,
			"X-Shopify-Shop-Domain": "synthetic-test-shop.myshopify.com",
			"X-Shopify-API-Version": apiVersion ?? API_VERSION,
			"X-Shopify-Webhook-Id": digest.slice(0, 32),
		};
	},

	identifyEvent({ headers }) {
		return getHeader(headers, "X-Shopify-Topic");
	},

	events: {
		"orders/create": {
			fixtureId: "shopify/orders/create",
			apiVersions: [API_VERSION],
			schema: {
				type: "object",
				required: ["id", "created_at", "currency", "total_price", "line_items"],
				properties: {
					id: { type: "integer" },
					created_at: { type: "string" },
					currency: { type: "string" },
					total_price: { type: "string" },
					line_items: {
						type: "array",
						items: {
							type: "object",
							required: ["id", "title", "quantity", "price"],
						},
					},
				},
			},
		},
		"orders/updated": {
			fixtureId: "shopify/orders/updated",
			apiVersions: [API_VERSION],
			schema: {
				type: "object",
				required: ["id", "created_at", "updated_at", "currency", "total_price"],
				properties: {
					id: { type: "integer" },
					updated_at: { type: "string" },
					line_items: { type: "array" },
				},
			},
		},
		"app/uninstalled": {
			fixtureId: "shopify/app/uninstalled",
			apiVersions: [API_VERSION],
			schema: {
				type: "object",
				required: ["id", "name", "domain", "myshopify_domain"],
				properties: {
					id: { type: "integer" },
					domain: { type: "string" },
					myshopify_domain: { type: "string" },
				},
			},
		},
	},

	// Shopify retries 19 times over ~48 hours with increasing delays.
	retryPolicy: { maxAttempts: 19, windowSec: 172800, backoff: "exponential" },
};
