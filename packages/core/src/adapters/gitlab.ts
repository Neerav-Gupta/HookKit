import { getHeader, safeEqual } from "../signature.js";
import type { ProviderAdapter } from "../types.js";

/**
 * GitLab webhook "signing"
 * (https://docs.gitlab.com/user/project/integrations/webhooks/#validate-payloads-by-using-a-secret-token):
 * there is no cryptographic signature at all — GitLab sends the shared
 * secret token verbatim in `X-Gitlab-Token`, and your app is expected to
 * compare it (constant-time) against the value configured in the webhook
 * settings. No official verification library exists for this scheme (there's
 * nothing to compute) — see gitlab.golden.test.ts for why that's the one
 * deliberate exception to the "verify against official library" rule.
 */

const EVENT_HEADER_NAMES: Record<string, string> = {
	"push-hook": "Push Hook",
};

export const gitlab: ProviderAdapter = {
	id: "gitlab",
	displayName: "GitLab",
	contentType: "application/json",
	signatureHeader: "X-Gitlab-Token",
	// GitLab's token is a static shared secret, not a signature over the body —
	// tampering the payload has no effect on validity. Real, documented,
	// deliberately weaker-than-HMAC design; not a bug in this adapter.
	verifiesBody: false,

	sign({ secret }) {
		return { "X-Gitlab-Token": secret };
	},

	verify({ headers, secret }) {
		const token = getHeader(headers, "X-Gitlab-Token");
		if (!token)
			return { valid: false, reason: "missing X-Gitlab-Token header" };
		return safeEqual(token, secret)
			? { valid: true }
			: { valid: false, reason: "token mismatch" };
	},

	headersFor({ eventType }) {
		return { "X-Gitlab-Event": EVENT_HEADER_NAMES[eventType] ?? eventType };
	},

	events: {
		"push-hook": {
			fixtureId: "gitlab/push-hook",
			apiVersions: ["v4"],
			schema: {
				type: "object",
				required: ["object_kind", "event_name", "ref", "project", "commits"],
				properties: {
					object_kind: { const: "push" },
					event_name: { const: "push" },
					ref: { type: "string" },
					project: {
						type: "object",
						required: ["id", "path_with_namespace"],
					},
					commits: { type: "array" },
				},
			},
		},
	},

	// GitLab does not automatically retry failed webhook deliveries.
	retryPolicy: {
		maxAttempts: 1,
		windowSec: 0,
		backoff: "fixed",
		delaysSec: [],
	},
};
