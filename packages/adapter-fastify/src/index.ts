/**
 * Fastify adapter.
 *
 * RAW-BODY FIDELITY: `registerRawBody` swaps the JSON content-type parser for
 * one that keeps the exact received bytes on `request.rawBody` while still
 * providing the parsed body to handlers.
 */
import type { FrameworkApp } from "@hookkit-dev/core";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
	interface FastifyRequest {
		rawBody?: Buffer;
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
