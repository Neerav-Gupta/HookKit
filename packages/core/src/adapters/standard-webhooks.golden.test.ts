import { generate } from "@hookkit-dev/core";
import { Webhook } from "standardwebhooks"; // dev-dependency, ORACLE only
import { expect, it } from "vitest";

// Standard Webhooks secrets are base64-encoded key bytes with a whsec_ prefix.
const secret = `whsec_${Buffer.from("hookkit-standard-webhooks-key").toString("base64")}`;

function oracleHeaders(headers: Record<string, string>) {
	return {
		"webhook-id": headers["webhook-id"] as string,
		"webhook-timestamp": headers["webhook-timestamp"] as string,
		"webhook-signature": headers["webhook-signature"] as string,
	};
}

it("standard-webhooks: generated event verifies with the official standardwebhooks lib", () => {
	// Fresh timestamp: the oracle enforces its own replay window against the wall clock.
	const evt = generate("standard-webhooks", "invoice.paid", { secret });
	const oracle = new Webhook(secret.slice("whsec_".length));
	const verified = oracle.verify(
		evt.rawBody.toString("utf8"),
		oracleHeaders(evt.headers),
	);
	expect(verified).toBeTruthy();
});

it("standard-webhooks: tampered body is rejected by the official standardwebhooks lib", () => {
	const evt = generate("standard-webhooks", "invoice.paid", { secret });
	const oracle = new Webhook(secret.slice("whsec_".length));
	expect(() =>
		oracle.verify(
			`${evt.rawBody.toString("utf8")} `,
			oracleHeaders(evt.headers),
		),
	).toThrow();
});
