import {
	createHash,
	createPrivateKey,
	createPublicKey,
	sign,
	verify,
} from "node:crypto";
import { getHeader } from "../signature.js";
import type { ProviderAdapter } from "../types.js";

/**
 * Discord webhook event signing
 * (https://discord.com/developers/docs/events/webhook-events —
 * same Ed25519 scheme as interaction verification):
 *   message = utf8Bytes(timestamp) + rawBody   (byte concatenation, no separator)
 *   X-Signature-Ed25519: hex(Ed25519_sign(privateKey, message))
 *   X-Signature-Timestamp: <timestamp>
 *
 * HookKit derives a 32-byte Ed25519 seed by SHA-256-hashing the adapter's
 * `secret` string (keeping the same `secret: string` contract every other
 * adapter uses). sign() uses the private half — simulating Discord, which
 * HookKit stands in for during tests. verify() derives the PUBLIC half from
 * the same seed. This differs from real Discord app code, which only ever
 * holds the public key (from the Developer Portal) — the shared-seed
 * convention exists purely so one HookKit "secret" string can drive both
 * signing and verifying in tests.
 */

// Fixed PKCS8 DER wrapper for a raw Ed25519 seed (RFC 8410): a 16-byte header
// (version + AlgorithmIdentifier OID 1.3.101.112 + OCTET STRING wrapper)
// followed by the 32-byte seed. Node's JWK import requires the public `x`
// alongside `d` (RFC 8037) — going through DER instead lets Node derive the
// public key itself from just the seed.
const ED25519_PKCS8_PREFIX = Buffer.from(
	"302e020100300506032b657004220420",
	"hex",
);

function deriveKeyPair(secret: string) {
	const seed = createHash("sha256").update(secret).digest(); // always exactly 32 bytes
	const der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
	const privateKey = createPrivateKey({
		key: der,
		format: "der",
		type: "pkcs8",
	});
	// Node's createPublicKey() accepts a private KeyObject directly at runtime
	// (it derives the corresponding public key) — verified working, but this
	// Node types version's overloads don't expose that input shape.
	const publicKey = createPublicKey(privateKey as unknown as Buffer);
	return { privateKey, publicKey };
}

/** Exposed so the golden test can re-derive the public key without duplicating this logic. */
export function discordPublicKeyHex(secret: string): string {
	const { publicKey } = deriveKeyPair(secret);
	const jwk = publicKey.export({ format: "jwk" }) as { x: string };
	return Buffer.from(jwk.x, "base64url").toString("hex");
}

export const discord: ProviderAdapter = {
	id: "discord",
	displayName: "Discord",
	contentType: "application/json",
	signatureHeader: "X-Signature-Ed25519",

	sign({ rawBody, secret, timestamp }) {
		const t = timestamp ?? Math.floor(Date.now() / 1000);
		const { privateKey } = deriveKeyPair(secret);
		const message = Buffer.concat([Buffer.from(String(t), "utf8"), rawBody]);
		const signature = sign(null, message, privateKey);
		return {
			"X-Signature-Ed25519": signature.toString("hex"),
			"X-Signature-Timestamp": String(t),
		};
	},

	verify({ rawBody, headers, secret }) {
		const signatureHex = getHeader(headers, "X-Signature-Ed25519");
		if (!signatureHex) {
			return { valid: false, reason: "missing X-Signature-Ed25519 header" };
		}
		const timestamp = getHeader(headers, "X-Signature-Timestamp");
		if (!timestamp) {
			return { valid: false, reason: "missing X-Signature-Timestamp header" };
		}
		const { publicKey } = deriveKeyPair(secret);
		const message = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
		try {
			const signature = Buffer.from(signatureHex, "hex");
			const valid = verify(null, message, publicKey, signature);
			return valid
				? { valid: true }
				: { valid: false, reason: "signature mismatch" };
		} catch {
			// Node's Ed25519 verify() can throw (not just return false) on a
			// malformed or wrong-length signature — treat that as a rejection.
			return { valid: false, reason: "malformed X-Signature-Ed25519 header" };
		}
	},

	identifyEvent({ parsedBody }) {
		const eventType = (parsedBody as { event?: { type?: string } } | null)
			?.event?.type;
		return eventType?.toLowerCase();
	},

	events: {
		application_authorized: {
			fixtureId: "discord/application_authorized",
			apiVersions: ["v1"],
			schema: {
				type: "object",
				required: ["version", "application_id", "type", "event"],
				properties: {
					type: { const: 1 },
					event: {
						type: "object",
						required: ["type", "timestamp", "data"],
						properties: { type: { const: "APPLICATION_AUTHORIZED" } },
					},
				},
			},
		},
	},

	// Undocumented publicly at time of writing — conservative placeholder.
	retryPolicy: { maxAttempts: 3, windowSec: 3600, backoff: "exponential" },
};
