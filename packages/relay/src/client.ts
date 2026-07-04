/**
 * Relay client — runs on the developer's machine. Opens an OUTBOUND
 * WebSocket to the user's own relay server and forwards every relayed
 * request to a local target, byte-for-byte.
 */
import type { RelayMessage, RelayResponse } from "./server.js";

export interface RelayClientOptions {
	/** e.g. wss://relay.example.com or http://127.0.0.1:8787 */
	relayUrl: string;
	token: string;
	/** Local target base URL, e.g. http://127.0.0.1:3000 */
	forwardTo: string;
	reconnect?: boolean;
	log?: (line: string) => void;
}

export interface RelayClientHandle {
	stop: () => void;
	/** Resolves once the WebSocket is open. */
	ready: Promise<void>;
}

export function connectRelay(options: RelayClientOptions): RelayClientHandle {
	const log = options.log ?? console.log;
	let stopped = false;
	let socket: WebSocket | undefined;

	let readyResolve: () => void = () => {};
	const ready = new Promise<void>((resolve) => {
		readyResolve = resolve;
	});

	const wsUrl = `${options.relayUrl.replace(/^http/, "ws").replace(/\/$/, "")}/connect/${options.token}`;

	function open() {
		socket = new WebSocket(wsUrl);
		socket.addEventListener("open", () => {
			log(
				`connected to relay ${options.relayUrl}, forwarding to ${options.forwardTo}`,
			);
			readyResolve();
		});
		socket.addEventListener("message", (event) => {
			void (async () => {
				const message = JSON.parse(String(event.data)) as RelayMessage;
				let response: RelayResponse;
				try {
					const upstream = await fetch(
						`${options.forwardTo.replace(/\/$/, "")}${message.path}`,
						{
							method: message.method,
							headers: stripTransportHeaders(message.headers),
							body:
								message.method === "GET" || message.method === "HEAD"
									? null
									: new Uint8Array(Buffer.from(message.bodyBase64, "base64")),
						},
					);
					response = {
						id: message.id,
						status: upstream.status,
						bodyBase64: Buffer.from(await upstream.arrayBuffer()).toString(
							"base64",
						),
					};
				} catch (err) {
					log(`forward failed: ${(err as Error).message}`);
					response = { id: message.id, status: 502 };
				}
				socket?.send(JSON.stringify(response));
				log(`${message.method} ${message.path} → ${response.status}`);
			})();
		});
		socket.addEventListener("close", () => {
			if (!stopped && options.reconnect !== false) {
				setTimeout(open, 3000);
			}
		});
		socket.addEventListener("error", () => {
			/* close handler drives reconnection */
		});
	}
	open();

	return {
		ready,
		stop: () => {
			stopped = true;
			socket?.close();
		},
	};
}

function stripTransportHeaders(
	headers: Record<string, string>,
): Record<string, string> {
	const clean = { ...headers };
	for (const name of [
		"host",
		"content-length",
		"connection",
		"accept-encoding",
	]) {
		delete clean[name];
	}
	return clean;
}
