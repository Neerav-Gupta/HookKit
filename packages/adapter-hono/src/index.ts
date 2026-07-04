/**
 * Hono adapter.
 *
 * RAW-BODY FIDELITY: read the exact bytes with `rawBody(c)`; never verify a
 * signature against `await c.req.json()` re-serialized.
 */
import type { FrameworkApp } from "@hookkit-dev/core";
import type { Context, Hono } from "hono";

/** Read the exact request bytes inside a Hono handler. */
export async function rawBody(c: Context): Promise<Buffer> {
	return Buffer.from(await c.req.arrayBuffer());
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
