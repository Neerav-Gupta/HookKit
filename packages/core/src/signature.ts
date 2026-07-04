/**
 * SignatureEngine — the only place HookKit computes or compares MACs.
 * Uses node:crypto exclusively (Invariant: no third-party crypto).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(
	secret: string | Buffer,
	message: string | Buffer,
): string {
	return createHmac("sha256", secret).update(message).digest("hex");
}

export function hmacSha256Base64(
	secret: string | Buffer,
	message: string | Buffer,
): string {
	return createHmac("sha256", secret).update(message).digest("base64");
}

export function hmacSha1Hex(
	secret: string | Buffer,
	message: string | Buffer,
): string {
	return createHmac("sha1", secret).update(message).digest("hex");
}

/** Constant-time string comparison; never use `===` on signature material. */
export function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a, "utf8");
	const bufB = Buffer.from(b, "utf8");
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

/** Case-insensitive header lookup (HTTP headers are case-insensitive). */
export function getHeader(
	headers: Record<string, string>,
	name: string,
): string | undefined {
	const lower = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === lower) return value;
	}
	return undefined;
}

/**
 * Flip the last alphanumeric character of a signature value so the MAC no
 * longer matches — used by failure-path testing (SDK tamperSignature, harness
 * malformed/badSignature).
 */
export function corruptSignature(value: string): string {
	for (let i = value.length - 1; i >= 0; i--) {
		const char = value[i] as string;
		if (/[A-Za-z0-9]/.test(char)) {
			const replacement = char === "0" ? "1" : "0";
			return value.slice(0, i) + replacement + value.slice(i + 1);
		}
	}
	return `${value}0`;
}

export const DEFAULT_TOLERANCE_SEC = 300;

/** Shared timestamp-freshness check used by timestamped signature schemes. */
export function withinTolerance(
	timestampSec: number,
	toleranceSec: number = DEFAULT_TOLERANCE_SEC,
	nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
	if (!Number.isFinite(timestampSec)) return false;
	return Math.abs(nowSec - timestampSec) <= toleranceSec;
}
