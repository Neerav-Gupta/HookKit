import { generate } from "@hookkit-dev/core";
import Stripe from "stripe"; // dev-dependency, used as the ORACLE only
import { expect, it } from "vitest";

it("stripe: generated event verifies with the official stripe SDK", () => {
	const secret = "whsec_test_secret";
	const evt = generate("stripe", "checkout.session.completed", {
		secret,
		timestamp: 1710000000,
	});
	// If Stripe's own verifier accepts it, our signing is provably correct.
	const constructed = Stripe.webhooks.constructEvent(
		evt.rawBody,
		evt.headers["Stripe-Signature"] as string,
		secret,
		// Stripe enforces a 300s default tolerance against the wall clock; the
		// pinned timestamp is in the past, so disable tolerance for the oracle.
		Number.POSITIVE_INFINITY,
	);
	expect(constructed.type).toBe("checkout.session.completed");
});

it("stripe: tampered body is rejected by the official stripe SDK", () => {
	const secret = "whsec_test_secret";
	const evt = generate("stripe", "checkout.session.completed", {
		secret,
		timestamp: 1710000000,
	});
	const tampered = Buffer.from(
		evt.rawBody
			.toString("utf8")
			.replace('"amount_total": 2000', '"amount_total": 9999'),
	);
	expect(() =>
		Stripe.webhooks.constructEvent(
			tampered,
			evt.headers["Stripe-Signature"] as string,
			secret,
			Number.POSITIVE_INFINITY,
		),
	).toThrow();
});
