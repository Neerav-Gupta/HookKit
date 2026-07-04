import { createHash } from "node:crypto";
import {
	getHeader,
	hmacSha1Hex,
	hmacSha256Hex,
	safeEqual,
} from "../signature.js";
import type { ProviderAdapter } from "../types.js";

/**
 * GitHub webhook signing (https://docs.github.com/webhooks — HMAC validation):
 *   X-Hub-Signature-256: sha256=<hex hmac-sha256(secret, rawBody)>
 *   X-Hub-Signature:     sha1=<hex hmac-sha1(secret, rawBody)>   (legacy)
 * No timestamp in the scheme.
 */
export const github: ProviderAdapter = {
	id: "github",
	displayName: "GitHub",
	contentType: "application/json",
	signatureHeader: "X-Hub-Signature-256",

	sign({ rawBody, secret }) {
		return {
			"X-Hub-Signature-256": `sha256=${hmacSha256Hex(secret, rawBody)}`,
			"X-Hub-Signature": `sha1=${hmacSha1Hex(secret, rawBody)}`,
		};
	},

	verify({ rawBody, headers, secret }) {
		const sha256Header = getHeader(headers, "X-Hub-Signature-256");
		if (sha256Header) {
			const expected = `sha256=${hmacSha256Hex(secret, rawBody)}`;
			return safeEqual(sha256Header, expected)
				? { valid: true }
				: { valid: false, reason: "signature mismatch" };
		}
		const sha1Header = getHeader(headers, "X-Hub-Signature");
		if (sha1Header) {
			const expected = `sha1=${hmacSha1Hex(secret, rawBody)}`;
			return safeEqual(sha1Header, expected)
				? { valid: true }
				: { valid: false, reason: "signature mismatch (legacy sha1)" };
		}
		return { valid: false, reason: "missing X-Hub-Signature-256 header" };
	},

	headersFor({ eventType, rawBody }) {
		// Deterministic synthetic delivery id derived from the payload bytes.
		const digest = createHash("sha256").update(rawBody).digest("hex");
		const deliveryId = [
			digest.slice(0, 8),
			digest.slice(8, 12),
			digest.slice(12, 16),
			digest.slice(16, 20),
			digest.slice(20, 32),
		].join("-");
		return {
			"X-GitHub-Event": eventType,
			"X-GitHub-Delivery": deliveryId,
			"User-Agent": "GitHub-Hookshot/hookkit",
		};
	},

	events: {
		push: {
			fixtureId: "github/push",
			apiVersions: ["2022-11-28"],
			schema: {
				type: "object",
				required: ["ref", "before", "after", "repository", "pusher", "commits"],
				properties: {
					ref: { type: "string" },
					before: { type: "string" },
					after: { type: "string" },
					repository: {
						type: "object",
						required: ["id", "name", "full_name", "owner"],
					},
					pusher: { type: "object", required: ["name"] },
					commits: { type: "array" },
				},
			},
		},
		pull_request: {
			fixtureId: "github/pull_request",
			apiVersions: ["2022-11-28"],
			schema: {
				type: "object",
				required: ["action", "number", "pull_request", "repository", "sender"],
				properties: {
					action: { type: "string" },
					number: { type: "integer" },
					pull_request: {
						type: "object",
						required: ["id", "number", "state", "title", "head", "base"],
					},
					repository: { type: "object", required: ["id", "full_name"] },
				},
			},
		},
		issues: {
			fixtureId: "github/issues",
			apiVersions: ["2022-11-28"],
			schema: {
				type: "object",
				required: ["action", "issue", "repository", "sender"],
				properties: {
					action: { type: "string" },
					issue: {
						type: "object",
						required: ["id", "number", "state", "title"],
					},
					repository: { type: "object", required: ["id", "full_name"] },
				},
			},
		},
	},

	// GitHub does not automatically retry failed deliveries.
	retryPolicy: {
		maxAttempts: 1,
		windowSec: 0,
		backoff: "fixed",
		delaysSec: [],
	},
};
