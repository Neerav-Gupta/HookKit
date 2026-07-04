import { createHash } from "node:crypto";
import {
	DEFAULT_TOLERANCE_SEC,
	getHeader,
	hmacSha256Base64,
	safeEqual,
	withinTolerance,
} from "../signature.js";
import type { ProviderAdapter } from "../types.js";

/**
 * Standard Webhooks signing (https://www.standardwebhooks.com/ spec v1):
 *   key bytes    = base64-decode(secret with optional "whsec_" prefix stripped)
 *   signedContent = `${webhook-id}.${webhook-timestamp}.${rawBody}`
 *   webhook-signature: `v1,${base64(hmac-sha256(keyBytes, signedContent))}`
 * The header may hold a space-separated list of signatures.
 */

function keyBytes(secret: string): Buffer {
	const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
	return Buffer.from(encoded, "base64");
}

function messageId(rawBody: Buffer, timestamp: number): string {
	const digest = createHash("sha256")
		.update(rawBody)
		.update(String(timestamp))
		.digest("hex");
	return `msg_${digest.slice(0, 24)}`;
}

export const standardWebhooks: ProviderAdapter = {
	id: "standard-webhooks",
	displayName: "Standard Webhooks",
	contentType: "application/json",
	signatureHeader: "webhook-signature",

	sign({ rawBody, secret, timestamp }) {
		const t = timestamp ?? Math.floor(Date.now() / 1000);
		const id = messageId(rawBody, t);
		const signedContent = `${id}.${t}.${rawBody.toString("utf8")}`;
		const signature = hmacSha256Base64(keyBytes(secret), signedContent);
		return {
			"webhook-id": id,
			"webhook-timestamp": String(t),
			"webhook-signature": `v1,${signature}`,
		};
	},

	verify({ rawBody, headers, secret, toleranceSec = DEFAULT_TOLERANCE_SEC }) {
		const id = getHeader(headers, "webhook-id");
		if (!id) return { valid: false, reason: "missing webhook-id header" };
		const timestampHeader = getHeader(headers, "webhook-timestamp");
		if (!timestampHeader) {
			return { valid: false, reason: "missing webhook-timestamp header" };
		}
		const signatureHeader = getHeader(headers, "webhook-signature");
		if (!signatureHeader) {
			return { valid: false, reason: "missing webhook-signature header" };
		}
		const timestamp = Number(timestampHeader);
		if (Number.isNaN(timestamp)) {
			return { valid: false, reason: "malformed webhook-timestamp header" };
		}
		const signedContent = `${id}.${timestamp}.${rawBody.toString("utf8")}`;
		const expected = hmacSha256Base64(keyBytes(secret), signedContent);
		const candidates = signatureHeader
			.split(" ")
			.filter((entry) => entry.startsWith("v1,"))
			.map((entry) => entry.slice(3));
		if (candidates.length === 0) {
			return {
				valid: false,
				reason: "no v1 signature in webhook-signature header",
			};
		}
		if (!candidates.some((candidate) => safeEqual(candidate, expected))) {
			return { valid: false, reason: "signature mismatch" };
		}
		if (!withinTolerance(timestamp, toleranceSec)) {
			return { valid: false, reason: "timestamp outside tolerance" };
		}
		return { valid: true };
	},

	events: {
		"invoice.paid": {
			fixtureId: "standard-webhooks/invoice.paid",
			apiVersions: ["v1"],
			schema: {
				type: "object",
				required: ["type", "timestamp", "data"],
				properties: {
					type: { const: "invoice.paid" },
					timestamp: { type: "string" },
					data: {
						type: "object",
						required: ["id", "amount", "currency", "status"],
					},
				},
			},
		},
	},

	// The spec recommends exponential backoff over at least a day.
	retryPolicy: { maxAttempts: 8, windowSec: 86400, backoff: "exponential" },
};
