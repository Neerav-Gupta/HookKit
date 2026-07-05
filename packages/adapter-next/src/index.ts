/**
 * Next.js App Router adapter. Route handlers receive a web-standard Request,
 * so the exact bytes are available via arrayBuffer().
 *
 * RAW-BODY FIDELITY: always verify against `rawBody(request)`, never against
 * `await request.json()` re-serialized.
 */
import type { FrameworkApp, IdempotencyStore } from "@hookkit-dev/core";
import { registry } from "@hookkit-dev/core";

export type RouteHandler = (request: Request) => Response | Promise<Response>;

/** Read the exact request bytes from a Next.js route handler's Request. */
export async function rawBody(request: Request): Promise<Buffer> {
	return Buffer.from(await request.arrayBuffer());
}

export interface VerifyRouteHandlerOptions {
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

export type VerifiedRouteHandler = (
	request: Request,
	event: unknown,
) => Response | Promise<Response>;

/**
 * Wraps an App Router route handler with signature verification (+ optional
 * idempotency). Uses `verifyAsync()` (Web Crypto) UNCONDITIONALLY — never
 * node:crypto — so the same handler works whether the route declares
 * `export const runtime = "nodejs"` or `"edge"`.
 *
 * ```ts
 * export const POST = verifyRouteHandler("stripe", { secret }, (request, event) => {
 *   // already verified AND deduped
 *   return Response.json({ received: true });
 * });
 * ```
 *
 * Responds 400 with a generic error on rejection (the real reason goes only
 * to `onRejected`, never to the client). The `request` passed to your handler
 * has already had its body consumed (to verify it) — use the `event`
 * parameter instead of re-reading `request.json()`/`.arrayBuffer()`.
 */
export function verifyRouteHandler(
	provider: string,
	opts: VerifyRouteHandlerOptions,
	handler: VerifiedRouteHandler,
): RouteHandler {
	const adapter = registry.get(provider);
	if (!adapter.verifyAsync) {
		throw new Error(
			`provider "${provider}" has no verifyAsync() — it can't be used with edge-portable middleware.`,
		);
	}
	const verifyAsync = adapter.verifyAsync.bind(adapter);

	return async (request: Request): Promise<Response> => {
		const raw = new Uint8Array(await request.arrayBuffer());
		const headers: Record<string, string> = {};
		for (const [key, value] of request.headers.entries()) headers[key] = value;

		const result = await verifyAsync({
			rawBody: raw,
			headers,
			secret: opts.secret,
			...(opts.toleranceSec !== undefined
				? { toleranceSec: opts.toleranceSec }
				: {}),
		});
		if (!result.valid) {
			opts.onRejected?.(result.reason);
			return Response.json({ error: "invalid signature" }, { status: 400 });
		}

		const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));

		if (opts.idempotency && opts.idempotencyKey) {
			const isNew = await opts.idempotency.checkAndSet(
				opts.idempotencyKey(parsed),
			);
			if (!isNew) {
				// Ack success so the provider stops retrying a delivery we've already handled.
				return Response.json(
					{ received: true, duplicate: true },
					{ status: 200 },
				);
			}
		}

		return handler(request, parsed);
	};
}

/**
 * Wrap an App Router route handler (`export async function POST(req)`) as a
 * HookKit delivery target. The handler is invoked directly — no server, no
 * network.
 */
export function toTarget(handler: RouteHandler, path?: string): FrameworkApp {
	return {
		async inject({ method, url, headers, body }) {
			const request = new Request(`http://hookkit.internal${path ?? url}`, {
				method,
				headers,
				body: new Uint8Array(body),
			});
			const response = await handler(request);
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
