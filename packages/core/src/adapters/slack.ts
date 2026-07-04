import {
	DEFAULT_TOLERANCE_SEC,
	getHeader,
	hmacSha256Hex,
	safeEqual,
	withinTolerance,
} from "../signature.js";
import type { ProviderAdapter } from "../types.js";

/**
 * Slack request signing (https://api.slack.com/authentication/verifying-requests-from-slack):
 *   base = `v0:${timestamp}:${rawBody}`
 *   X-Slack-Signature: v0=<hex hmac-sha256(signingSecret, base)>
 *   X-Slack-Request-Timestamp: <timestamp>
 * Verifiers must reject requests older than the tolerance window.
 */
export const slack: ProviderAdapter = {
	id: "slack",
	displayName: "Slack",
	contentType: "application/json",
	signatureHeader: "X-Slack-Signature",

	sign({ rawBody, secret, timestamp }) {
		const t = timestamp ?? Math.floor(Date.now() / 1000);
		const base = `v0:${t}:${rawBody.toString("utf8")}`;
		return {
			"X-Slack-Signature": `v0=${hmacSha256Hex(secret, base)}`,
			"X-Slack-Request-Timestamp": String(t),
		};
	},

	verify({ rawBody, headers, secret, toleranceSec = DEFAULT_TOLERANCE_SEC }) {
		const signature = getHeader(headers, "X-Slack-Signature");
		if (!signature) {
			return { valid: false, reason: "missing X-Slack-Signature header" };
		}
		const timestampHeader = getHeader(headers, "X-Slack-Request-Timestamp");
		if (!timestampHeader) {
			return {
				valid: false,
				reason: "missing X-Slack-Request-Timestamp header",
			};
		}
		const timestamp = Number(timestampHeader);
		if (Number.isNaN(timestamp)) {
			return {
				valid: false,
				reason: "malformed X-Slack-Request-Timestamp header",
			};
		}
		const base = `v0:${timestamp}:${rawBody.toString("utf8")}`;
		const expected = `v0=${hmacSha256Hex(secret, base)}`;
		if (!safeEqual(signature, expected)) {
			return { valid: false, reason: "signature mismatch" };
		}
		if (!withinTolerance(timestamp, toleranceSec)) {
			return { valid: false, reason: "timestamp outside tolerance" };
		}
		return { valid: true };
	},

	events: {
		app_mention: {
			fixtureId: "slack/app_mention",
			apiVersions: ["v1"],
			schema: {
				type: "object",
				required: [
					"token",
					"team_id",
					"event",
					"type",
					"event_id",
					"event_time",
				],
				properties: {
					type: { const: "event_callback" },
					team_id: { type: "string", pattern: "^T" },
					event: {
						type: "object",
						required: ["type", "channel", "event_ts"],
						properties: {
							type: { const: "app_mention" },
						},
					},
					event_id: { type: "string", pattern: "^Ev" },
					event_time: { type: "integer" },
				},
			},
		},
	},

	// Slack retries 3 times (immediately, 1 min, 5 min).
	retryPolicy: {
		maxAttempts: 4,
		windowSec: 360,
		backoff: "custom",
		delaysSec: [0, 60, 300],
	},
};
