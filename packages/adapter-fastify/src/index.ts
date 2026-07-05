/**
 * Fastify adapter.
 *
 * RAW-BODY FIDELITY: `registerRawBody` swaps the JSON content-type parser for
 * one that keeps the exact received bytes on `request.rawBody` while still
 * providing the parsed body to handlers.
 */
import type { FrameworkApp, IdempotencyStore } from "@hookkit-dev/core";
import { registry } from "@hookkit-dev/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
	interface FastifyRequest {
		rawBody?: Buffer;
		/** The JSON-parsed body — already verified (and idempotency-checked) by verifyPreHandler(). */
		hookkitEvent?: unknown;
	}
}

export function registerRawBody(app: FastifyInstance): void {
	app.removeContentTypeParser("application/json");
	app.addContentTypeParser(
		"application/json",
		{ parseAs: "buffer" },
		(request, payload: Buffer, done) => {
			request.rawBody = payload;
			try {
				done(null, JSON.parse(payload.toString("utf8")));
			} catch (err) {
				done(err as Error);
			}
		},
	);
}

export interface VerifyPreHandlerOptions {
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
 * Drop-in signature-verification (+ optional idempotency) Fastify
 * `preHandler` hook. Requires `registerRawBody(app)` to have been called at
 * app setup (Fastify's raw-body capture is a content-type-parser override,
 * so it's app-level, not chainable per-route like Express middleware).
 *
 * `app.post(path, { preHandler: verifyPreHandler("stripe", { secret }) }, handler)`
 *
 * Replies 400 with a generic error on rejection (the real reason goes only to
 * `onRejected`, never to the client) and short-circuits before the route
 * handler runs. On success, sets `request.hookkitEvent` (the parsed body).
 */
export function verifyPreHandler(
	provider: string,
	opts: VerifyPreHandlerOptions,
) {
	const adapter = registry.get(provider);
	return async (
		request: FastifyRequest,
		reply: FastifyReply,
	): Promise<void> => {
		const rawBody = request.rawBody;
		if (!rawBody) {
			throw new Error(
				"verifyPreHandler requires registerRawBody(app) to be called first — " +
					"request.rawBody is missing.",
			);
		}
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(request.headers)) {
			if (typeof value === "string") headers[key] = value;
		}
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
			await reply.code(400).send({ error: "invalid signature" });
			return;
		}

		if (opts.idempotency && opts.idempotencyKey) {
			const isNew = await opts.idempotency.checkAndSet(
				opts.idempotencyKey(request.body),
			);
			if (!isNew) {
				// Ack success so the provider stops retrying a delivery we've already handled.
				await reply.code(200).send({ received: true, duplicate: true });
				return;
			}
		}

		request.hookkitEvent = request.body;
	};
}

/**
 * Wrap a Fastify app as a HookKit delivery target using fastify's built-in
 * `inject` — the request never touches a socket.
 */
export function toTarget(app: FastifyInstance, path?: string): FrameworkApp {
	return {
		async inject({ method, url, headers, body }) {
			const response = await app.inject({
				method: method as "POST",
				url: path ?? url,
				headers,
				payload: body,
			});
			return {
				status: response.statusCode,
				body: response.body,
				headers: Object.fromEntries(
					Object.entries(response.headers).map(([key, value]) => [
						key,
						String(value),
					]),
				),
			};
		},
	};
}
