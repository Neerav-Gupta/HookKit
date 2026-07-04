import type { DeliveryResult } from "@hookkit-dev/core";

interface MatcherResult {
	pass: boolean;
	message: () => string;
}

/**
 * Vitest/Jest-compatible matchers. Register with `expect.extend(matchers)` or
 * import "@hookkit-dev/sdk/vitest" once in a setup file.
 */
export const matchers = {
	toBeAccepted(received: DeliveryResult): MatcherResult {
		const pass = received.status >= 200 && received.status < 300;
		return {
			pass,
			message: () =>
				`expected delivery ${pass ? "not " : ""}to be accepted (2xx), got ${received.status}` +
				` — body: ${received.body.slice(0, 200)}`,
		};
	},
	toHaveRejectedWithStatus(
		received: DeliveryResult,
		expected: number,
	): MatcherResult {
		const pass = received.status === expected;
		return {
			pass,
			message: () =>
				`expected delivery ${pass ? "not " : ""}to be rejected with ${expected}, got ${received.status}` +
				` — body: ${received.body.slice(0, 200)}`,
		};
	},
};

export interface HookkitMatchers<R = unknown> {
	/** Asserts the DeliveryResult has a 2xx status. */
	toBeAccepted(): R;
	/** Asserts the DeliveryResult has exactly this status. */
	toHaveRejectedWithStatus(status: number): R;
}
