/**
 * Self-hosted relay server (NO-CLOUD invariant: HookKit never operates one —
 * YOU deploy this on YOUR host).
 *
 * Providers POST to  https://your-relay/hook/<token>/...
 * Your dev machine keeps an OUTBOUND WebSocket open at /connect/<token> and
 * receives every request, forwards it to localhost, and returns the response.
 */

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { type WebSocket, WebSocketServer } from "ws";

export interface RelayMessage {
	id: string;
	method: string;
	path: string;
	headers: Record<string, string>;
	bodyBase64: string;
}

export interface RelayResponse {
	id: string;
	status: number;
	headers?: Record<string, string>;
	bodyBase64?: string;
}

export interface RelayServerOptions {
	port?: number;
	host?: string;
	/** Restrict accepted tokens; empty/omitted = any token may register. */
	tokens?: string[];
	/** Per-request response timeout (ms). */
	timeoutMs?: number;
	log?: (line: string) => void;
}

export function startRelayServer(options: RelayServerOptions = {}): {
	server: Server;
	port: () => number;
	stop: () => Promise<void>;
} {
	const log = options.log ?? console.log;
	const timeoutMs = options.timeoutMs ?? 10_000;
	const clients = new Map<string, WebSocket>();
	const pending = new Map<
		string,
		{ resolve: (res: RelayResponse) => void; timer: NodeJS.Timeout }
	>();

	const tokenAllowed = (token: string) =>
		!options.tokens ||
		options.tokens.length === 0 ||
		options.tokens.includes(token);

	const server = createServer((req, res) => {
		void (async () => {
			const url = new URL(req.url ?? "/", "http://relay.internal");
			const match = url.pathname.match(/^\/hook\/([^/]+)(\/.*)?$/);
			if (!match) {
				res.statusCode = url.pathname === "/healthz" ? 200 : 404;
				res.end(url.pathname === "/healthz" ? "ok" : "not found");
				return;
			}
			const [, token, rest] = match;
			const client =
				token && tokenAllowed(token) ? clients.get(token) : undefined;
			if (!client || client.readyState !== client.OPEN) {
				res.statusCode = 502;
				res.end("no client connected for this token");
				return;
			}

			const chunks: Buffer[] = [];
			for await (const chunk of req) chunks.push(chunk as Buffer);
			const headers: Record<string, string> = {};
			for (const [key, value] of Object.entries(req.headers)) {
				if (typeof value === "string") headers[key] = value;
			}

			const message: RelayMessage = {
				id: randomUUID(),
				method: req.method ?? "POST",
				path: (rest ?? "/") + url.search,
				headers,
				// base64 keeps the EXACT bytes intact across the WebSocket.
				bodyBase64: Buffer.concat(chunks).toString("base64"),
			};

			const response = await new Promise<RelayResponse>((resolve) => {
				const timer = setTimeout(() => {
					pending.delete(message.id);
					resolve({ id: message.id, status: 504 });
				}, timeoutMs);
				pending.set(message.id, { resolve, timer });
				client.send(JSON.stringify(message));
			});

			res.statusCode = response.status;
			res.end(
				response.bodyBase64
					? Buffer.from(response.bodyBase64, "base64")
					: undefined,
			);
		})();
	});

	const wss = new WebSocketServer({ noServer: true });
	server.on("upgrade", (req: IncomingMessage, socket, head) => {
		const match = (req.url ?? "").match(/^\/connect\/([^/?]+)/);
		const token = match?.[1];
		if (!token || !tokenAllowed(token)) {
			socket.destroy();
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => {
			clients.get(token)?.close();
			clients.set(token, ws);
			log(`client connected for token ${token.slice(0, 6)}…`);
			ws.on("message", (data) => {
				const response = JSON.parse(String(data)) as RelayResponse;
				const waiter = pending.get(response.id);
				if (waiter) {
					clearTimeout(waiter.timer);
					pending.delete(response.id);
					waiter.resolve(response);
				}
			});
			ws.on("close", () => {
				if (clients.get(token) === ws) clients.delete(token);
				log(`client disconnected for token ${token.slice(0, 6)}…`);
			});
		});
	});

	const host = options.host ?? "0.0.0.0";
	server.listen(options.port ?? 8787, host, () => {
		log(
			`relay server listening on ${host}:${(server.address() as { port: number }).port}`,
		);
	});

	return {
		server,
		port: () => (server.address() as { port: number }).port,
		stop: () =>
			new Promise<void>((resolve) => {
				for (const ws of clients.values()) ws.close();
				wss.close();
				server.close(() => resolve());
			}),
	};
}
