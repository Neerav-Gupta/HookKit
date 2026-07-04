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
import type { FrameworkApp } from "@hookkit-dev/core";

export interface RawBodyIncomingMessage extends IncomingMessage {
	rawBody: Buffer;
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
