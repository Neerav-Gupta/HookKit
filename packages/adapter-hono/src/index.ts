/**
 * Hono adapter.
 *
 * RAW-BODY FIDELITY: read the exact bytes with `rawBody(c)`; never verify a
 * signature against `await c.req.json()` re-serialized.
 */
import type { FrameworkApp, IdempotencyStore } from "@hookkit-dev/core";
import { registry } from "@hookkit-dev/core";
import type { Context, Hono, MiddlewareHandler } from "hono";

/** Read the exact request bytes inside a Hono handler. */
export async function rawBody(c: Context): Promise<Buffer> {
	return Buffer.from(await c.req.arrayBuffer());
}

export interface VerifyMiddlewareOptions {
	/** The provider's webhook signing secret. Never logged. */
	secret: string;
	toleranceSec?: number;
	/** Optional dedupe — verify AND idempotency-check in one drop-in step. */
	idempotency?: IdempotencyStore;
	/** Derives the idempotency key from the parsed event body. Required if `idempotency` is set. */
	idempotencyKey?: (parsed: unknown) => string;
	/** Called with the rejection reason for server-side logging. Never sent to the client. */
	onRejected?: (reason: string | undefined) => void;
}

/**
 * Drop-in signature-verification (+ optional idempotency) Hono middleware.
 * Uses `verifyAsync()` (Web Crypto) UNCONDITIONALLY — never node:crypto — so
 * this middleware runs identically on Node, Cloudflare Workers, Vercel Edge,
 * and Deno Deploy without any runtime detection.
 *
 * `app.post(path, verifyMiddleware("stripe", { secret }), handler)`
 *
 * Responds 400 with a generic error on rejection (the real reason goes only
 * to `onRejected`, never to the client). On success, the parsed body is
 * available to downstream handlers via `c.get("hookkitEvent")`.
 */
export function verifyMiddleware(
	provider: string,
	opts: VerifyMiddlewareOptions,
): MiddlewareHandler {
	const adapter = registry.get(provider);
	if (!adapter.verifyAsync) {
		throw new Error(
			`provider "${provider}" has no verifyAsync() — it can't be used with edge-portable middleware.`,
		);
	}
	const verifyAsync = adapter.verifyAsync.bind(adapter);

	return async (c, next) => {
		const rawBody = new Uint8Array(await c.req.arrayBuffer());
		const headers: Record<string, string> = {};
		for (const [key, value] of c.req.raw.headers.entries())
			headers[key] = value;

		const result = await verifyAsync({
			rawBody,
			headers,
			secret: opts.secret,
			...(opts.toleranceSec !== undefined
				? { toleranceSec: opts.toleranceSec }
				: {}),
		});
		if (!result.valid) {
			opts.onRejected?.(result.reason);
			return c.json({ error: "invalid signature" }, 400);
		}

		const parsed: unknown = JSON.parse(new TextDecoder().decode(rawBody));

		if (opts.idempotency && opts.idempotencyKey) {
			const isNew = await opts.idempotency.checkAndSet(
				opts.idempotencyKey(parsed),
			);
			if (!isNew) {
				// Ack success so the provider stops retrying a delivery we've already handled.
				return c.json({ received: true, duplicate: true }, 200);
			}
		}

		c.set("hookkitEvent", parsed);
		await next();
	};
}

/**
 * Wrap a Hono app as a HookKit delivery target using Hono's built-in
 * `app.request` — fully in-process, no network.
 */
export function toTarget(app: Hono, path?: string): FrameworkApp {
	return {
		async inject({ method, url, headers, body }) {
			const response = await app.request(path ?? url, {
				method,
				headers,
				body: new Uint8Array(body),
			});
			const responseHeaders: Record<string, string> = {};
			response.headers.forEach((value, key) => {
				responseHeaders[key] = value;
			});
			return {
				status: response.status,
				body: await response.text(),
				headers: responseHeaders,
			};
		},
	};
}
