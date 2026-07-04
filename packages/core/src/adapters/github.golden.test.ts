import { generate, github } from "@hookkit-dev/core";
import { verify } from "@octokit/webhooks-methods"; // dev-dependency, ORACLE only
import { expect, it } from "vitest";

const secret = "github_test_secret";

it("github: generated event verifies with @octokit/webhooks-methods", async () => {
	const evt = generate("github", "push", { secret });
	const ok = await verify(
		secret,
		evt.rawBody.toString("utf8"),
		evt.headers["X-Hub-Signature-256"] as string,
	);
	expect(ok).toBe(true);
});

it("github: emits a well-formed legacy sha1 header that our verifier accepts", () => {
	// @octokit/webhooks-methods v6 dropped sha1 support, so the legacy header
	// is checked for format and via our own sha1 fallback path instead.
	const evt = generate("github", "push", { secret });
	expect(evt.headers["X-Hub-Signature"]).toMatch(/^sha1=[0-9a-f]{40}$/);
	const sha1Only = {
		"X-Hub-Signature": evt.headers["X-Hub-Signature"] as string,
	};
	expect(
		github.verify({ rawBody: evt.rawBody, headers: sha1Only, secret }),
	).toEqual({ valid: true });
});

it("github: tampered body is rejected by @octokit/webhooks-methods", async () => {
	const evt = generate("github", "push", { secret });
	const tampered = `${evt.rawBody.toString("utf8")} `;
	const ok = await verify(
		secret,
		tampered,
		evt.headers["X-Hub-Signature-256"] as string,
	);
	expect(ok).toBe(false);
});
