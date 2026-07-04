import { generate, registry } from "@hookkit-dev/core";
import { getFixture } from "@hookkit-dev/fixtures";
import { describe, expect, it } from "vitest";

const secret = "whsec_test_secret";
const now = Math.floor(Date.now() / 1000);

describe("stripe adapter", () => {
	it("round-trips: sign then verify", () => {
		const evt = generate("stripe", "checkout.session.completed", {
			secret,
			timestamp: now,
		});
		const result = registry.get("stripe").verify({
			rawBody: evt.rawBody,
			headers: evt.headers,
			secret,
		});
		expect(result).toEqual({ valid: true });
	});

	it("rejects a tampered body", () => {
		const evt = generate("stripe", "checkout.session.completed", {
			secret,
			timestamp: now,
		});
		const tampered = Buffer.concat([evt.rawBody, Buffer.from(" ")]);
		const result = registry.get("stripe").verify({
			rawBody: tampered,
			headers: evt.headers,
			secret,
		});
		expect(result.valid).toBe(false);
		expect(result.reason).toBe("signature mismatch");
	});

	it("rejects a wrong secret", () => {
		const evt = generate("stripe", "checkout.session.completed", {
			secret,
			timestamp: now,
		});
		const result = registry.get("stripe").verify({
			rawBody: evt.rawBody,
			headers: evt.headers,
			secret: "whsec_other",
		});
		expect(result.valid).toBe(false);
	});

	it("rejects a stale timestamp beyond tolerance", () => {
		const evt = generate("stripe", "checkout.session.completed", {
			secret,
			timestamp: now - 3600,
		});
		const result = registry.get("stripe").verify({
			rawBody: evt.rawBody,
			headers: evt.headers,
			secret,
		});
		expect(result).toEqual({
			valid: false,
			reason: "timestamp outside tolerance",
		});
	});

	it("preserves fixture bytes exactly when no overrides are given", () => {
		const evt = generate("stripe", "checkout.session.completed", {
			secret,
			timestamp: now,
		});
		const fixture = getFixture("stripe/checkout.session.completed");
		expect(evt.rawBody.equals(fixture.rawBody)).toBe(true);
	});

	it("applies overrides with a single serialization", () => {
		const evt = generate("stripe", "checkout.session.completed", {
			secret,
			timestamp: now,
			overrides: { data: { object: { amount_total: 4242 } } },
		});
		const parsed = evt.parsed as {
			data: { object: { amount_total: number; currency: string } };
		};
		expect(parsed.data.object.amount_total).toBe(4242);
		expect(parsed.data.object.currency).toBe("usd"); // sibling fields survive the merge
		expect(JSON.parse(evt.rawBody.toString("utf8"))).toEqual(evt.parsed);
	});
});
