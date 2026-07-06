import { generate, registry } from "@hookkit-dev/core";
import { expect, it } from "vitest";

/**
 * GitLab has no signing scheme and ships no official verification library —
 * webhooks carry a static shared-secret token (`X-Gitlab-Token`) that GitLab
 * itself just string-compares against the value configured in the webhook
 * settings (https://docs.gitlab.com/user/project/integrations/webhooks/#validate-payloads-by-using-a-secret-token).
 * This "golden test" documents that exact, real behavior directly instead of
 * checking against an oracle library — the one deliberate exception to the
 * "verify against official library" rule, since there is no library to check
 * against for a scheme this simple.
 */

it("gitlab: sign() emits the token verbatim in X-Gitlab-Token, matching GitLab's documented scheme", () => {
	const secret = "gitlab_test_secret_token";
	const evt = generate("gitlab", "push-hook", { secret });
	expect(evt.headers["X-Gitlab-Token"]).toBe(secret); // no hashing — literally the configured token
	expect(evt.headers["X-Gitlab-Event"]).toBe("Push Hook"); // GitLab's real header value, verbatim
});

it("gitlab: verify() accepts the exact configured token and rejects any other value", () => {
	const secret = "gitlab_test_secret_token";
	const evt = generate("gitlab", "push-hook", { secret });
	expect(
		registry
			.get("gitlab")
			.verify({ rawBody: evt.rawBody, headers: evt.headers, secret }),
	).toEqual({
		valid: true,
	});
	expect(
		registry.get("gitlab").verify({
			rawBody: evt.rawBody,
			headers: { ...evt.headers, "X-Gitlab-Token": "wrong-token" },
			secret,
		}).valid,
	).toBe(false);
});
