/**
 * Shared conformance suite. Every provider adapter must pass every check
 * before it is considered done (see CLAUDE.md). Framework-agnostic: each
 * check throws on failure, so any test runner can drive it.
 */
import { strict as assert } from "node:assert";
import { getFixture } from "@hookkit-dev/fixtures";
import { generate } from "./generate.js";
import { getHeader } from "./signature.js";
import type { ProviderAdapter } from "./types.js";

export interface ConformanceCheck {
	name: string;
	run: () => void | Promise<void>;
}

/**
 * Base64 of 32 fixed bytes with a whsec_ prefix: opaque enough for every
 * scheme, and decodable by key-byte schemes like Standard Webhooks.
 */
export const CONFORMANCE_SECRET = `whsec_${Buffer.from(
	"hookkit-conformance-secret-32byte",
).toString("base64")}`;

// A structurally similar but cryptographically different secret. (Merely
// appending characters is not enough: extra chars after base64 padding decode
// to the same key bytes for key-byte schemes.)
const WRONG_SECRET = `whsec_${Buffer.from(
	"hookkit-conformance-wrong-secret!",
).toString("base64")}`;

export function conformanceChecks(
	adapter: ProviderAdapter,
	secret: string = CONFORMANCE_SECRET,
): ConformanceCheck[] {
	const now = () => Math.floor(Date.now() / 1000);
	const eventTypes = Object.keys(adapter.events);
	const firstEvent = eventTypes[0];

	const checks: ConformanceCheck[] = [
		{
			name: "metadata is complete",
			run: () => {
				assert.ok(adapter.id.length > 0, "id must be non-empty");
				assert.ok(
					adapter.displayName.length > 0,
					"displayName must be non-empty",
				);
				assert.ok(
					adapter.contentType.length > 0,
					"contentType must be non-empty",
				);
				assert.ok(
					adapter.signatureHeader.length > 0,
					"signatureHeader must be non-empty",
				);
				assert.ok(eventTypes.length > 0, "events must be non-empty");
			},
		},
		{
			name: "retryPolicy is coherent",
			run: () => {
				const { maxAttempts, windowSec, backoff, delaysSec } =
					adapter.retryPolicy;
				assert.ok(maxAttempts >= 1, "maxAttempts must be >= 1");
				assert.ok(windowSec >= 0, "windowSec must be >= 0");
				if (backoff === "custom") {
					assert.ok(
						Array.isArray(delaysSec),
						"custom backoff requires delaysSec",
					);
				}
			},
		},
		{
			name: "every declared fixture resolves",
			run: () => {
				for (const [eventType, descriptor] of Object.entries(adapter.events)) {
					const versions = descriptor.apiVersions ?? [undefined];
					for (const version of versions) {
						const fixture = getFixture(descriptor.fixtureId, version);
						assert.ok(
							fixture.rawBody.length > 0,
							`fixture for ${eventType}@${version} must be non-empty`,
						);
						JSON.parse(fixture.rawBody.toString("utf8")); // must be valid JSON
					}
				}
			},
		},
		{
			name: "sign() emits the declared signature header",
			run: () => {
				assert.ok(firstEvent, "adapter declares at least one event");
				const evt = generate(adapter.id, firstEvent, {
					secret,
					timestamp: now(),
				});
				assert.ok(
					getHeader(evt.headers, adapter.signatureHeader) !== undefined,
					`sign() must emit ${adapter.signatureHeader}`,
				);
			},
		},
		{
			name: "sign() is deterministic for a pinned timestamp",
			run: () => {
				assert.ok(firstEvent, "adapter declares at least one event");
				const t = now();
				const a = generate(adapter.id, firstEvent, { secret, timestamp: t });
				const b = generate(adapter.id, firstEvent, { secret, timestamp: t });
				assert.deepEqual(a.headers, b.headers);
				assert.ok(a.rawBody.equals(b.rawBody));
			},
		},
	];

	for (const eventType of eventTypes) {
		checks.push({
			name: `round-trip: ${eventType} signs then verifies`,
			run: () => {
				const evt = generate(adapter.id, eventType, {
					secret,
					timestamp: now(),
				});
				const result = adapter.verify({
					rawBody: evt.rawBody,
					headers: evt.headers,
					secret,
				});
				assert.deepEqual(result, { valid: true });
			},
		});
	}

	checks.push(
		{
			name: "rejects a tampered body",
			run: () => {
				assert.ok(firstEvent, "adapter declares at least one event");
				const evt = generate(adapter.id, firstEvent, {
					secret,
					timestamp: now(),
				});
				const tampered = Buffer.concat([evt.rawBody, Buffer.from(" ")]);
				const result = adapter.verify({
					rawBody: tampered,
					headers: evt.headers,
					secret,
				});
				assert.equal(result.valid, false, "tampered body must be rejected");
				assert.ok(result.reason, "rejection must carry a reason");
			},
		},
		{
			name: "rejects a wrong secret",
			run: () => {
				assert.ok(firstEvent, "adapter declares at least one event");
				const evt = generate(adapter.id, firstEvent, {
					secret,
					timestamp: now(),
				});
				const result = adapter.verify({
					rawBody: evt.rawBody,
					headers: evt.headers,
					secret: WRONG_SECRET,
				});
				assert.equal(result.valid, false, "wrong secret must be rejected");
			},
		},
		{
			name: "rejects when all signature headers are missing",
			run: () => {
				assert.ok(firstEvent, "adapter declares at least one event");
				const evt = generate(adapter.id, firstEvent, {
					secret,
					timestamp: now(),
				});
				// Strip everything sign() produced (some providers emit legacy
				// fallback headers alongside the primary one).
				const signed = new Set(
					Object.keys(
						adapter.sign({ rawBody: evt.rawBody, secret, timestamp: now() }),
					).map((key) => key.toLowerCase()),
				);
				const headers = Object.fromEntries(
					Object.entries(evt.headers).filter(
						([key]) => !signed.has(key.toLowerCase()),
					),
				);
				const result = adapter.verify({
					rawBody: evt.rawBody,
					headers,
					secret,
				});
				assert.equal(
					result.valid,
					false,
					"missing signature headers must be rejected",
				);
			},
		},
		{
			name: "timestamped schemes reject stale timestamps",
			run: () => {
				assert.ok(firstEvent, "adapter declares at least one event");
				const stale = now() - 100_000;
				const staleEvt = generate(adapter.id, firstEvent, {
					secret,
					timestamp: stale,
				});
				const fresh = generate(adapter.id, firstEvent, {
					secret,
					timestamp: now(),
				});
				const timestamped =
					JSON.stringify(staleEvt.headers) !== JSON.stringify(fresh.headers);
				if (!timestamped) return; // untimestamped scheme (e.g. GitHub, Shopify)
				const result = adapter.verify({
					rawBody: staleEvt.rawBody,
					headers: staleEvt.headers,
					secret,
				});
				assert.equal(result.valid, false, "stale timestamp must be rejected");
				assert.match(result.reason ?? "", /timestamp/i);
			},
		},
	);

	return checks;
}
