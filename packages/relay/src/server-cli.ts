#!/usr/bin/env node
/** Standalone relay server entry (Docker CMD). */
import { startRelayServer } from "./server.js";

const tokens = (process.env.RELAY_TOKENS ?? "")
	.split(",")
	.map((token) => token.trim())
	.filter(Boolean);

if (tokens.length === 0) {
	console.error(
		"RELAY_TOKENS is required (comma-separated shared secrets). " +
			"Anyone with a token can route webhooks to a connected client — pick long random values.",
	);
	process.exit(1);
}

startRelayServer({
	port: Number(process.env.RELAY_PORT ?? 8787),
	host: process.env.RELAY_HOST ?? "0.0.0.0",
	tokens,
});
