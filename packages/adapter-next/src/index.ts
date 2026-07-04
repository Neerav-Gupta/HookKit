/**
 * Next.js App Router adapter. Route handlers receive a web-standard Request,
 * so the exact bytes are available via arrayBuffer().
 *
 * RAW-BODY FIDELITY: always verify against `rawBody(request)`, never against
 * `await request.json()` re-serialized.
 */
import type { FrameworkApp } from "@hookkit-dev/core";

export type RouteHandler = (request: Request) => Response | Promise<Response>;

/** Read the exact request bytes from a Next.js route handler's Request. */
export async function rawBody(request: Request): Promise<Buffer> {
	return Buffer.from(await request.arrayBuffer());
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
