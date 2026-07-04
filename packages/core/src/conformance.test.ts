import { conformanceChecks, registry } from "@hookkit-dev/core";
import { describe, expect, it } from "vitest";

const EXPECTED_PROVIDERS = [
	"stripe",
	"github",
	"shopify",
	"slack",
	"standard-webhooks",
];

it("registry ships all expected providers", () => {
	expect(registry.list().map((adapter) => adapter.id)).toEqual(
		EXPECTED_PROVIDERS,
	);
});

for (const adapter of registry.list()) {
	describe(`conformance: ${adapter.id}`, () => {
		for (const check of conformanceChecks(adapter)) {
			it(check.name, async () => {
				await check.run();
			});
		}
	});
}
