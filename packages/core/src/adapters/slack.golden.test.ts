import { generate } from "@hookkit-dev/core";
import { verifySlackRequest } from "@slack/bolt"; // dev-dependency, ORACLE only
import { expect, it } from "vitest";

const signingSecret = "slack_test_signing_secret";

function boltInput(evt: { rawBody: Buffer; headers: Record<string, string> }) {
	return {
		signingSecret,
		body: evt.rawBody.toString("utf8"),
		headers: {
			"x-slack-signature": evt.headers["X-Slack-Signature"] as string,
			"x-slack-request-timestamp": Number(
				evt.headers["X-Slack-Request-Timestamp"],
			),
		},
	};
}

it("slack: generated event verifies with the official @slack/bolt verifier", () => {
	// Fresh timestamp: bolt enforces the 5-minute replay window against the wall clock.
	const evt = generate("slack", "app_mention", { secret: signingSecret });
	expect(() => verifySlackRequest(boltInput(evt))).not.toThrow();
});

it("slack: tampered body is rejected by the official @slack/bolt verifier", () => {
	const evt = generate("slack", "app_mention", { secret: signingSecret });
	const input = boltInput(evt);
	expect(() =>
		verifySlackRequest({ ...input, body: `${input.body} ` }),
	).toThrow();
});

it("slack: stale timestamp is rejected by the official @slack/bolt verifier", () => {
	const evt = generate("slack", "app_mention", {
		secret: signingSecret,
		timestamp: Math.floor(Date.now() / 1000) - 3600,
	});
	expect(() => verifySlackRequest(boltInput(evt))).toThrow();
});
