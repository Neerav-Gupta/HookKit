/**
 * Side-effect entry: `import "@hookkit-dev/sdk/vitest"` in a test or setup
 * file registers the matchers and their types with Vitest.
 */
import { expect } from "vitest";
import { type HookkitMatchers, matchers } from "./matchers.js";

expect.extend(matchers);

declare module "vitest" {
	// biome-ignore lint/suspicious/noExplicitAny: matches vitest's own Assertion signature
	interface Assertion<T = any> extends HookkitMatchers<T> {}
	interface AsymmetricMatchersContaining extends HookkitMatchers {}
}
