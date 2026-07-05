/**
 * Web Crypto (`globalThis.crypto.subtle`) equivalents of signature.ts, for the
 * OPTIONAL async verify path used by edge-targeting production middleware
 * (adapter-hono, adapter-next). Portable to any runtime that implements the
 * standard Web Crypto API — Node, Cloudflare Workers, Vercel Edge, Deno Deploy,
 * browsers. Still zero third-party crypto dependencies (see CLAUDE.md).
 *
 * The sync node:crypto path in signature.ts remains the source of truth for
 * ALL testing (sign/generate/dispatch); this module is verify-only and never
 * used by it.
 */

const textEncoder = new TextEncoder();

function toBytes(message: string | Uint8Array): Uint8Array<ArrayBuffer> {
	// `new Uint8Array(existing)` copies into a fresh, plain ArrayBuffer-backed
	// array — needed because Node Buffers (and some edge-runtime byte arrays)
	// carry the looser `Uint8Array<ArrayBufferLike>` type that Web Crypto's
	// BufferSource doesn't accept.
	return typeof message === "string"
		? textEncoder.encode(message)
		: new Uint8Array(message);
}

async function importHmacKey(
	secret: string | Uint8Array,
	hash: "SHA-256" | "SHA-1",
): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		toBytes(secret),
		{ name: "HMAC", hash },
		false,
		["sign"],
	);
}

function bytesToHex(bytes: ArrayBuffer): string {
	return [...new Uint8Array(bytes)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function bytesToBase64(bytes: ArrayBuffer): string {
	let binary = "";
	for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
	return btoa(binary);
}

async function hmac(
	secret: string | Uint8Array,
	message: string | Uint8Array,
	hash: "SHA-256" | "SHA-1",
): Promise<ArrayBuffer> {
	const key = await importHmacKey(secret, hash);
	return crypto.subtle.sign("HMAC", key, toBytes(message));
}

export async function hmacSha256HexWeb(
	secret: string | Uint8Array,
	message: string | Uint8Array,
): Promise<string> {
	return bytesToHex(await hmac(secret, message, "SHA-256"));
}

export async function hmacSha256Base64Web(
	secret: string | Uint8Array,
	message: string | Uint8Array,
): Promise<string> {
	return bytesToBase64(await hmac(secret, message, "SHA-256"));
}

export async function hmacSha1HexWeb(
	secret: string | Uint8Array,
	message: string | Uint8Array,
): Promise<string> {
	return bytesToHex(await hmac(secret, message, "SHA-1"));
}

/**
 * Constant-time string comparison without relying on node:crypto's
 * timingSafeEqual (not guaranteed present on every edge runtime). Mirrors the
 * same length-then-full-compare shape as signature.ts's safeEqual().
 */
export function safeEqualWeb(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
