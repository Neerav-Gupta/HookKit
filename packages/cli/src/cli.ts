#!/usr/bin/env node
/**
 * hookkit — offline webhook dev CLI. No telemetry, no phone-home: the only
 * network traffic is to the target URL the user explicitly provides.
 */
import { cac } from "cac";
import {
	listEvents,
	listProviders,
	replay,
	trigger,
	verify,
} from "./commands.js";

const cli = cac("hookkit");

function emit(result: { exitCode: number; output: string[] }): never {
	for (const line of result.output) console.log(line);
	process.exit(result.exitCode);
}

cli
	.command(
		"trigger <provider> <event>",
		"Generate, sign, and deliver a webhook event",
	)
	.option("--to <url>", "Target URL")
	.option("--secret <secret>", "Signing secret (never logged)")
	.option("--set <path=value>", "Override a payload field (repeatable)")
	.option("--api-version <version>", "Pin the fixture API version")
	.action(async (provider: string, event: string, options) => {
		emit(
			await trigger(provider, event, {
				to: options.to,
				secret: options.secret,
				set: options.set,
				apiVersion: options.apiVersion,
			}),
		);
	});

cli
	.command("replay <file>", "Re-deliver a captured request from a JSON file")
	.option("--to <url>", "Target URL")
	.action(async (file: string, options) => {
		emit(await replay(file, { to: options.to }));
	});

cli
	.command("list <what> [provider]", "List providers, or events of a provider")
	.action((what: string, provider?: string) => {
		if (what === "providers") emit(listProviders());
		if (what === "events" && provider) emit(listEvents(provider));
		emit({
			exitCode: 1,
			output: [
				"usage: hookkit list providers | hookkit list events <provider>",
			],
		});
	});

cli
	.command("verify <provider>", "Verify a signed request body against a secret")
	.option("--body <body>", "Request body; @file reads bytes from a file")
	.option("--header <header>", 'Request header as "Name: value" (repeatable)')
	.option("--secret <secret>", "Signing secret (never logged)")
	.option("--tolerance <seconds>", "Timestamp tolerance in seconds")
	.action(async (provider: string, options) => {
		emit(
			await verify(provider, {
				body: options.body,
				header: options.header,
				secret: options.secret,
				...(options.tolerance !== undefined
					? { tolerance: Number(options.tolerance) }
					: {}),
			}),
		);
	});

// cac@6 does not reliably match multi-word (space-separated) literal command
// names like "fixtures add <a> <b>" at parse time (registers fine, never
// matches) — verified directly against the installed version. A single
// "fixtures <action> [...rest]" command with internal dispatch is the
// pattern that actually works; the built-in `list <what> [provider]` command
// above uses the same shape for the same reason.
cli
	.command(
		"fixtures <action> [...rest]",
		"Scaffold a fixture (add) or save one from the inspector",
	)
	.option("--api-version <version>", "API version directory for the fixture")
	.option("--inspector-url <url>", "Running inspector's base URL", {
		default: "http://127.0.0.1:4000",
	})
	.option("--provider <provider>", "Provider id (for save-from-inspector)")
	.option("--event <event>", "Event type (for save-from-inspector)")
	.action(async (action: string, rest: string[], options) => {
		if (action === "add") {
			const [provider, event] = rest;
			if (!provider || !event) {
				emit({
					exitCode: 1,
					output: ["usage: hookkit fixtures add <provider> <event>"],
				});
			}
			const { fixturesAdd } = await import("./fixtures-cmd.js");
			emit(
				fixturesAdd(provider, event, {
					...(options.apiVersion ? { apiVersion: options.apiVersion } : {}),
				}),
			);
		}
		if (action === "save-from-inspector") {
			const [requestId] = rest;
			if (!requestId || !options.provider || !options.event) {
				emit({
					exitCode: 1,
					output: [
						"usage: hookkit fixtures save-from-inspector <requestId> --provider <p> --event <e>",
					],
				});
			}
			const { fixturesSaveFromInspector } = await import("./fixtures-cmd.js");
			emit(
				await fixturesSaveFromInspector(requestId, {
					inspectorUrl: options.inspectorUrl,
					provider: options.provider,
					eventType: options.event,
					...(options.apiVersion ? { apiVersion: options.apiVersion } : {}),
				}),
			);
		}
		emit({
			exitCode: 1,
			output: [
				"usage: hookkit fixtures add <provider> <event> | fixtures save-from-inspector <requestId> --provider <p> --event <e>",
			],
		});
	});

cli
	.command(
		"listen <port>",
		"Receive real provider events via YOUR tunnel and forward to localhost",
	)
	.option("--tunnel <kind>", "Tunnel to spawn: cloudflared | ngrok | frpc")
	.option("--path <path>", "Path on your local handler, e.g. /webhooks/stripe")
	.option(
		"--capture-port <port>",
		"Port for the capture server (default: ephemeral)",
	)
	.action(async (port: string, options) => {
		const { startListen } = await import("./listen.js");
		await startListen({
			port: Number(port),
			...(options.path ? { path: options.path } : {}),
			...(options.tunnel ? { tunnel: options.tunnel } : {}),
			...(options.capturePort
				? { capturePort: Number(options.capturePort) }
				: {}),
		});
	});

cli
	.command("inspect", "Launch the local webhook inspector UI")
	.option("--port <port>", "Port to listen on", { default: 4000 })
	.option("--host <host>", "Host to bind (non-loopback requires --auth)", {
		default: "127.0.0.1",
	})
	.option("--auth <user:pass>", "Basic auth credentials")
	.option(
		"--db <path>",
		"SQLite database path (default ~/.hookkit/inspector.sqlite)",
	)
	.action(async (options) => {
		// Lazy import: the inspector (with its native SQLite dep) loads only
		// when actually requested.
		const { InspectorDb, startInspector } = await import(
			"@hookkit-dev/inspector"
		);
		startInspector({
			host: options.host,
			port: Number(options.port),
			...(options.auth ? { auth: options.auth } : {}),
			...(options.db ? { db: new InspectorDb(options.db) } : {}),
		});
	});

cli.help();
cli.version("0.0.1");

cli.parse(process.argv, { run: false });
if (!cli.matchedCommand) {
	cli.outputHelp();
	process.exit(process.argv.length > 2 ? 1 : 0);
}
await cli.runMatchedCommand();
