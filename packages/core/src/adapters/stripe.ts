import {
	DEFAULT_TOLERANCE_SEC,
	getHeader,
	hmacSha256Hex,
	safeEqual,
	withinTolerance,
} from "../signature.js";
import type { ProviderAdapter } from "../types.js";

/**
 * Stripe webhook signing (https://docs.stripe.com/webhooks — signature scheme v1):
 *   signedPayload = `${timestamp}.${rawBody}`
 *   Stripe-Signature: t=<timestamp>,v1=<hex hmac-sha256(secret, signedPayload)>
 */
export const stripe: ProviderAdapter = {
	id: "stripe",
	displayName: "Stripe",
	contentType: "application/json",
	signatureHeader: "Stripe-Signature",

	sign({ rawBody, secret, timestamp }) {
		const t = timestamp ?? Math.floor(Date.now() / 1000);
		const signedPayload = `${t}.${rawBody.toString("utf8")}`;
		const v1 = hmacSha256Hex(secret, signedPayload);
		return { "Stripe-Signature": `t=${t},v1=${v1}` };
	},

	verify({ rawBody, headers, secret, toleranceSec = DEFAULT_TOLERANCE_SEC }) {
		const header = getHeader(headers, "Stripe-Signature");
		if (!header)
			return { valid: false, reason: "missing Stripe-Signature header" };

		let timestamp: number | undefined;
		const candidates: string[] = [];
		for (const part of header.split(",")) {
			const eq = part.indexOf("=");
			if (eq === -1) continue;
			const key = part.slice(0, eq).trim();
			const value = part.slice(eq + 1).trim();
			if (key === "t") timestamp = Number(value);
			if (key === "v1") candidates.push(value);
		}
		if (timestamp === undefined || Number.isNaN(timestamp)) {
			return {
				valid: false,
				reason: "malformed Stripe-Signature header: missing t=",
			};
		}
		if (candidates.length === 0) {
			return {
				valid: false,
				reason: "malformed Stripe-Signature header: missing v1=",
			};
		}
		const expected = hmacSha256Hex(
			secret,
			`${timestamp}.${rawBody.toString("utf8")}`,
		);
		if (!candidates.some((candidate) => safeEqual(candidate, expected))) {
			return { valid: false, reason: "signature mismatch" };
		}
		if (!withinTolerance(timestamp, toleranceSec)) {
			return { valid: false, reason: "timestamp outside tolerance" };
		}
		return { valid: true };
	},

	events: {
		"checkout.session.completed": {
			fixtureId: "stripe/checkout.session.completed",
			apiVersions: ["2025-04-10"],
		},
	},

	// Stripe retries with exponential backoff for up to 3 days.
	retryPolicy: { maxAttempts: 8, windowSec: 259200, backoff: "exponential" },
};
