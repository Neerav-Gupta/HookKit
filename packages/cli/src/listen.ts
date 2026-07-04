/**
 * `hookkit listen <port>` — receive REAL provider events without a hosted
 * relay (NO-CLOUD invariant): a local capture server verifies + forwards to
 * the user's app, and the public path comes from a tunnel the USER runs
 * (bring-your-own: cloudflared / ngrok / frpc) or their self-hosted relay.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { registry } from "@hookkit-dev/core";

export interface ListenOptions {
	/** Port of the user's local webhook handler (forward target). */
	port: number;
	/** Path on the local handler, e.g. /webhooks/stripe. Defaults to the request path. */
	path?: string;
	/** Tunnel to spawn: cloudflared | ngrok | frpc. Omit to print the local URL only. */
	tunnel?: string;
	/** Capture server port (0 = ephemeral). */
	capturePort?: number;
	log?: (line: string) => void;
}

export interface ListenHandle {
	server: Server;
	captureUrl: string;
	tunnelProcess?: ChildProcess;
	stop: () => Promise<void>;
}

function guessProvider(headers: Record<string, string>): string {
	const lower = new Set(Object.keys(headers).map((key) => key.toLowerCase()));
	for (const adapter of registry.list()) {
		if (lower.has(adapter.signatureHeader.toLowerCase())) return adapter.id;
	}
	return "";
}

export async function startListen(
	options: ListenOptions,
): Promise<ListenHandle> {
	const log = options.log ?? console.log;

	const server = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => {
			void (async () => {
				const rawBody = Buffer.concat(chunks);
				const headers: Record<string, string> = {};
				for (const [key, value] of Object.entries(req.headers)) {
					if (typeof value === "string") headers[key] = value;
				}

				// Verify when a secret is available; never log the secret itself.
				const provider = guessProvider(headers);
				let verdict = "unsigned";
				if (provider) {
					const secret =
						process.env[
							`HOOKKIT_${provider.toUpperCase().replaceAll("-", "_")}_SECRET`
						] ?? process.env.HOOKKIT_SECRET;
					verdict = secret
						? registry.get(provider).verify({ rawBody, headers, secret }).valid
							? "valid ✓"
							: "INVALID ✗"
						: `${provider} (set HOOKKIT_${provider.toUpperCase().replaceAll("-", "_")}_SECRET to verify)`;
				}

				const forwardPath = options.path ?? req.url ?? "/";
				const target = `http://127.0.0.1:${options.port}${forwardPath}`;
				const forwardHeaders = { ...headers };
				delete forwardHeaders.host;
				delete forwardHeaders["content-length"];
				delete forwardHeaders.connection;

				try {
					const upstream = await fetch(target, {
						method: req.method ?? "POST",
						headers: forwardHeaders,
						body:
							req.method === "GET" || req.method === "HEAD"
								? null
								: new Uint8Array(rawBody),
					});
					const body = Buffer.from(await upstream.arrayBuffer());
					log(
						`→ ${req.method} ${forwardPath} [${provider || "unknown"}: ${verdict}] → ${upstream.status} (${rawBody.length} bytes)`,
					);
					res.statusCode = upstream.status;
					res.end(body);
				} catch (err) {
					log(
						`→ ${req.method} ${forwardPath} — forward failed: ${(err as Error).message}`,
					);
					res.statusCode = 502;
					res.end("bad gateway (is your app listening?)");
				}
			})();
		});
	});

	await new Promise<void>((resolve) =>
		server.listen(options.capturePort ?? 0, "127.0.0.1", resolve),
	);
	const address = server.address();
	const capturePort = typeof address === "object" && address ? address.port : 0;
	const captureUrl = `http://127.0.0.1:${capturePort}`;
	log(
		`listening on ${captureUrl}, forwarding to http://127.0.0.1:${options.port}${options.path ?? ""}`,
	);

	let tunnelProcess: ChildProcess | undefined;
	if (options.tunnel) {
		tunnelProcess = spawnTunnel(options.tunnel, capturePort, log);
	}

	return {
		server,
		captureUrl,
		...(tunnelProcess ? { tunnelProcess } : {}),
		stop: async () => {
			tunnelProcess?.kill();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}

/** Shell out to a tunnel the user already has installed. BYO — never ours. */
function spawnTunnel(
	kind: string,
	capturePort: number,
	log: (line: string) => void,
): ChildProcess {
	const local = `http://127.0.0.1:${capturePort}`;
	let child: ChildProcess;
	switch (kind) {
		case "cloudflared": {
			child = spawn("cloudflared", ["tunnel", "--url", local], {
				stdio: "pipe",
			});
			const scan = (chunk: Buffer) => {
				const match = chunk
					.toString()
					.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
				if (match)
					log(`public URL: ${match[0]}  → point your provider's webhook here`);
			};
			child.stdout?.on("data", scan);
			child.stderr?.on("data", scan);
			break;
		}
		case "ngrok": {
			child = spawn("ngrok", ["http", String(capturePort)], { stdio: "pipe" });
			log("ngrok started — grab the public URL from http://127.0.0.1:4040");
			break;
		}
		case "frpc": {
			child = spawn("frpc", ["http", "--local-port", String(capturePort)], {
				stdio: "inherit",
			});
			log("frpc started with your local frpc configuration");
			break;
		}
		default:
			throw new Error(
				`unknown tunnel "${kind}". Supported: cloudflared, ngrok, frpc`,
			);
	}
	child.on("error", (err) => {
		log(
			`tunnel "${kind}" failed to start: ${err.message}. Is it installed and on your PATH?`,
		);
	});
	return child;
}
