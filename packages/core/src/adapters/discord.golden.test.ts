import { generate } from "@hookkit-dev/core";
import { verifyKey } from "discord-interactions"; // dev-dependency, ORACLE only
import { expect, it } from "vitest";
import { discordPublicKeyHex } from "./discord.js";

const secret = "whsec_discord_golden_test_secret";

it("discord: generated event verifies with the official discord-interactions library", async () => {
	const evt = generate("discord", "application_authorized", {
		secret,
		timestamp: 1710000000,
	});
	const ok = await verifyKey(
		evt.rawBody,
		evt.headers["X-Signature-Ed25519"] as string,
		evt.headers["X-Signature-Timestamp"] as string,
		discordPublicKeyHex(secret),
	);
	expect(ok).toBe(true);
});

it("discord: tampered body is rejected by the official discord-interactions library", async () => {
	const evt = generate("discord", "application_authorized", {
		secret,
		timestamp: 1710000000,
	});
	const tampered = Buffer.from(`${evt.rawBody.toString("utf8")} `);
	const ok = await verifyKey(
		tampered,
		evt.headers["X-Signature-Ed25519"] as string,
		evt.headers["X-Signature-Timestamp"] as string,
		discordPublicKeyHex(secret),
	);
	expect(ok).toBe(false);
});
