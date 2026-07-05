/**
 * Express (and any node:http-based framework) adapter.
 *
 * RAW-BODY FIDELITY: `rawBodyMiddleware` buffers the request stream into
 * `req.rawBody` before any JSON parsing can consume or re-serialize it.
 * Signature verification must always read `req.rawBody`, never a parsed body.
 */
import {
	createServer,
	type IncomingMessage,
	type RequestListener,
	type ServerResponse,
} from "node:http";
import type { FrameworkApp, IdempotencyStore } from "@hookkit-dev/core";
import { registry } from "@hookkit-dev/core";

export interface RawBodyIncomingMessage extends IncomingMessage {
	rawBody: Buffer;
}

export interface VerifiedIncomingMessage extends RawBodyIncomingMessage {
	/** The JSON-parsed body — already verified and idempotency-checked by the time your handler runs. */
	hookkitEvent: unknown;
}

/**
 * Connect/Express-style middleware that captures the exact request bytes as
 * `req.rawBody` (a Buffer). Mount it on webhook routes BEFORE any body parser.
 */
export function rawBodyMiddleware() {
	return (
		req: IncomingMessage,
		_res: ServerResponse,
		next: (err?: unknown) => void,
	): void => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			(req as RawBodyIncomingMessage).rawBody = Buffer.concat(chunks);
			next();
		});
		req.on("error", (err) => next(err));
	};
}

function normalizeHeaders(
	headers: IncomingMessage["headers"],
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (typeof value === "string") result[key] = value;
	}
	return result;
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
 * Drop-in raw-body-capture + signature-verification (+ optional idempotency)
 * Express middleware: `app.post(path, verifyMiddleware("stripe", { secret }), handler)`
 * — no need to chain rawBodyMiddleware() separately. Responds 400 with a
 * generic error on rejection (the real reason goes only to `onRejected`,
 * never to the client) and does not call `next()`. On success, sets
 * `req.rawBody` and `req.hookkitEvent` (the parsed body) before calling `next()`.
 */
export function verifyMiddleware(
	provider: string,
	opts: VerifyMiddlewareOptions,
) {
	const adapter = registry.get(provider);
	return (
		req: IncomingMessage,
		res: ServerResponse,
		next: (err?: unknown) => void,
	): void => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			void (async () => {
				const rawBody = Buffer.concat(chunks);
				const headers = normalizeHeaders(req.headers);
				const result = adapter.verify({
					rawBody,
					headers,
					secret: opts.secret,
					...(opts.toleranceSec !== undefined
						? { toleranceSec: opts.toleranceSec }
						: {}),
				});
				if (!result.valid) {
					opts.onRejected?.(result.reason);
					res.statusCode = 400;
					res.setHeader("content-type", "application/json");
					res.end(JSON.stringify({ error: "invalid signature" }));
					return;
				}

				const parsed: unknown = JSON.parse(rawBody.toString("utf8"));

				if (opts.idempotency && opts.idempotencyKey) {
					const isNew = await opts.idempotency.checkAndSet(
						opts.idempotencyKey(parsed),
					);
					if (!isNew) {
						// Ack success so the provider stops retrying a delivery we've already handled.
						res.statusCode = 200;
						res.setHeader("content-type", "application/json");
						res.end(JSON.stringify({ received: true, duplicate: true }));
						return;
					}
				}

				const verified = req as VerifiedIncomingMessage;
				verified.rawBody = rawBody;
				verified.hookkitEvent = parsed;
				next();
			})();
		});
		req.on("error", (err) => next(err));
	};
}

/**
 * Wrap an Express app (or any node:http request listener) as a HookKit
 * delivery target. Each inject spins up an ephemeral loopback-only server —
 * no external network is ever touched.
 */
export function toTarget(app: RequestListener, path?: string): FrameworkApp {
	return {
		async inject({ method, url, headers, body }) {
			const server = createServer(app);
			await new Promise<void>((resolve) =>
				server.listen(0, "127.0.0.1", resolve),
			);
			try {
				const address = server.address();
				const port = typeof address === "object" && address ? address.port : 0;
				const response = await fetch(`http://127.0.0.1:${port}${path ?? url}`, {
					method,
					headers,
					body: new Uint8Array(body),
				});
				const responseBody = await response.text();
				const responseHeaders: Record<string, string> = {};
				response.headers.forEach((value, key) => {
					responseHeaders[key] = value;
				});
				return {
					status: response.status,
					body: responseBody,
					headers: responseHeaders,
				};
			} finally {
				await new Promise<void>((resolve) => server.close(() => resolve()));
			}
		},
	};
}
