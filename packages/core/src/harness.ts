/**
 * Correctness harness: drives a webhook handler the way a misbehaving real
 * world does — duplicate deliveries, retries, out-of-order arrival, and
 * malformed requests — and reports whether the handler held up.
 */
import { dispatch } from "./dispatch.js";
import { registry } from "./registry.js";
import { corruptSignature } from "./signature.js";
import type {
	DeliveryResult,
	DeliveryTarget,
	GeneratedEvent,
} from "./types.js";

export interface HarnessReport {
	pass: boolean;
	detail: string;
	results: DeliveryResult[];
}

/** Re-generate an event, optionally with a pinned signing timestamp. */
export type EventFactory = (opts?: { timestamp?: number }) => GeneratedEvent;

function ok(result: DeliveryResult): boolean {
	return result.status >= 200 && result.status < 300;
}

/**
 * Deliver the SAME event (identical bytes, headers, and ids) `times` times.
 * Providers routinely double-deliver; an idempotent handler must accept every
 * duplicate (2xx). Handlers that crash or error on the duplicate fail.
 */
export async function idempotency(
	evt: GeneratedEvent,
	target: DeliveryTarget,
	opts: { times?: number } = {},
): Promise<HarnessReport> {
	const times = opts.times ?? 2;
	const results: DeliveryResult[] = [];
	for (let i = 0; i < times; i++) {
		results.push(await dispatch(evt, target));
	}
	const failures = results.filter((r) => !ok(r));
	return {
		pass: failures.length === 0,
		detail:
			failures.length === 0
				? `handler accepted the same delivery ${times}× (idempotent)`
				: `handler rejected a duplicate delivery with ${failures[0]?.status} (statuses: ${results.map((r) => r.status).join(", ")})`,
		results,
	};
}

/**
 * Deliver like a retrying provider: re-send (fresh signature each attempt)
 * until the handler accepts or attempts run out. With `fail`/`then` the
 * report also asserts the exact failure count before success and the final
 * status observed.
 */
export async function retry(
	factory: EventFactory,
	target: DeliveryTarget,
	opts: { fail?: number; then?: number; maxAttempts?: number } = {},
): Promise<HarnessReport> {
	const first = factory();
	const maxAttempts =
		opts.maxAttempts ??
		(opts.fail !== undefined
			? opts.fail + 1
			: registry.get(first.provider).retryPolicy.maxAttempts);

	const results: DeliveryResult[] = [];
	let event = first;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const result = await dispatch(event, target);
		results.push(result);
		if (ok(result)) break;
		event = factory(); // fresh timestamp/signature, like a real redelivery
	}

	const succeeded = ok(results.at(-1) as DeliveryResult);
	let pass = succeeded;
	let detail = succeeded
		? `handler accepted after ${results.length} attempt(s)`
		: `handler never accepted within ${maxAttempts} attempt(s) (statuses: ${results.map((r) => r.status).join(", ")})`;

	if (opts.fail !== undefined) {
		const failures = results.length - (succeeded ? 1 : 0);
		if (failures !== opts.fail) {
			pass = false;
			detail = `expected ${opts.fail} failure(s) before success, saw ${failures} (statuses: ${results.map((r) => r.status).join(", ")})`;
		}
	}
	if (pass && opts.then !== undefined && results.at(-1)?.status !== opts.then) {
		pass = false;
		detail = `expected final status ${opts.then}, saw ${results.at(-1)?.status}`;
	}
	return { pass, detail, results };
}

/**
 * Deliver events OUT OF ORDER (reversed) — providers do not guarantee
 * ordering, so a correct handler must accept each event regardless of
 * arrival sequence.
 */
export async function ordering(
	events: GeneratedEvent[],
	target: DeliveryTarget,
): Promise<HarnessReport> {
	const reversed = [...events].reverse();
	const results: DeliveryResult[] = [];
	for (const evt of reversed) {
		results.push(await dispatch(evt, target));
	}
	const failures = results.filter((r) => !ok(r));
	return {
		pass: failures.length === 0,
		detail:
			failures.length === 0
				? `handler accepted all ${events.length} events delivered out of order`
				: `handler rejected out-of-order delivery (statuses: ${results.map((r) => r.status).join(", ")})`,
		results,
	};
}

export type MalformedKind =
	| "truncated"
	| "badContentType"
	| "expiredTimestamp"
	| "badSignature";

/**
 * Deliver a deliberately broken request. The handler PASSES by REJECTING it
 * (non-2xx): accepting a truncated body, wrong content type, expired
 * timestamp, or bad signature is a security bug.
 */
export async function malformed(
	factory: EventFactory,
	target: DeliveryTarget,
	opts: { kind: MalformedKind },
): Promise<HarnessReport> {
	let evt = factory();
	switch (opts.kind) {
		case "truncated": {
			const cut = Math.max(1, Math.floor(evt.rawBody.length * 0.2));
			evt = {
				...evt,
				rawBody: evt.rawBody.subarray(0, evt.rawBody.length - cut),
			};
			break;
		}
		case "badContentType": {
			evt = {
				...evt,
				headers: { ...evt.headers, "Content-Type": "text/plain" },
			};
			break;
		}
		case "expiredTimestamp": {
			evt = factory({ timestamp: Math.floor(Date.now() / 1000) - 100_000 });
			break;
		}
		case "badSignature": {
			const headerName = registry.get(evt.provider).signatureHeader;
			const headers = { ...evt.headers };
			for (const key of Object.keys(headers)) {
				if (key.toLowerCase() === headerName.toLowerCase()) {
					headers[key] = corruptSignature(headers[key] ?? "");
				}
			}
			evt = { ...evt, headers };
			break;
		}
	}

	const result = await dispatch(evt, target);
	const rejected = !ok(result);
	// badContentType alone (signature still valid over the same bytes) is
	// acceptable to some handlers; every other kind MUST be rejected.
	const mustReject = opts.kind !== "badContentType";
	const pass = mustReject ? rejected : true;
	return {
		pass,
		detail: rejected
			? `handler rejected ${opts.kind} with ${result.status}`
			: `handler ACCEPTED a ${opts.kind} request with ${result.status}${mustReject ? " — this is a bug" : ""}`,
		results: [result],
	};
}

export const harness = { idempotency, retry, ordering, malformed };
