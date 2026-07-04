#!/usr/bin/env node
/** Relay client entry: hookkit-relay-client <relayUrl> <token> <forwardTo> */
import { connectRelay } from "./client.js";

const [relayUrl, token, forwardTo] = process.argv.slice(2);
if (!relayUrl || !token || !forwardTo) {
	console.error(
		"usage: hookkit-relay-client <relayUrl> <token> <forwardTo>\n" +
			"  e.g. hookkit-relay-client wss://relay.example.com my-token http://127.0.0.1:3000",
	);
	process.exit(1);
}

connectRelay({ relayUrl, token, forwardTo });
