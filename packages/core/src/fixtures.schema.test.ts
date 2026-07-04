/**
 * Fixture-schema validation (CI drift gate): every fixture a provider declares
 * must parse and satisfy the event's JSON Schema. Fails CI when a fixture and
 * its adapter drift apart.
 */
import { registry } from "@hookkit-dev/core";
import { getFixture, listFixtures } from "@hookkit-dev/fixtures";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";

const ajv = new Ajv({ allErrors: true });

for (const adapter of registry.list()) {
	describe(`fixture schemas: ${adapter.id}`, () => {
		for (const [eventType, descriptor] of Object.entries(adapter.events)) {
			it(`${eventType} declares a schema`, () => {
				expect(
					descriptor.schema,
					"every event needs a schema for drift detection",
				).toBeDefined();
			});

			for (const version of descriptor.apiVersions ?? [undefined]) {
				it(`${eventType}@${version ?? "latest"} fixture matches its schema`, () => {
					const fixture = getFixture(descriptor.fixtureId, version);
					const parsed = JSON.parse(fixture.rawBody.toString("utf8"));
					const validate = ajv.compile(descriptor.schema as object);
					const valid = validate(parsed);
					expect(valid, JSON.stringify(validate.errors ?? [], null, 2)).toBe(
						true,
					);
				});
			}
		}
	});
}

it("every manifest fixture is claimed by a registered adapter", () => {
	const claimed = new Set(
		registry
			.list()
			.flatMap((adapter) => Object.values(adapter.events))
			.map((descriptor) => descriptor.fixtureId),
	);
	for (const { fixtureId } of listFixtures()) {
		expect(claimed.has(fixtureId), `orphan fixture: ${fixtureId}`).toBe(true);
	}
});
