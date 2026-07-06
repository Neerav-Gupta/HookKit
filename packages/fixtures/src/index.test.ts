import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	addFixture,
	fixturePackageRoot,
	getFixture,
	loadManifest,
} from "./index.js";

// addFixture() writes into this real package's fixtures/ dir and
// manifest.json (that's its whole job) — use an obviously-fake provider name
// so cleanup can't collide with anything real, and always restore
// manifest.json to its prior contents, even if an assertion throws.
const TEST_PROVIDER = "__vitest_addfixture_test__";
const root = fixturePackageRoot();
const manifestPath = join(root, "manifest.json");
const originalManifest = readFileSync(manifestPath, "utf8");

afterEach(() => {
	writeFileSync(manifestPath, originalManifest);
	rmSync(join(root, "fixtures", TEST_PROVIDER), {
		recursive: true,
		force: true,
	});
	expect(existsSync(join(root, "fixtures", TEST_PROVIDER))).toBe(false);
});

describe("addFixture", () => {
	it("writes a placeholder skeleton and registers it in the manifest", () => {
		const result = addFixture(TEST_PROVIDER, "widget.created");
		expect(result.alreadyExisted).toBe(false);
		expect(result.fixtureId).toBe(`${TEST_PROVIDER}/widget.created`);

		const fixture = getFixture(result.fixtureId, result.apiVersion);
		const parsed = JSON.parse(fixture.rawBody.toString("utf8"));
		expect(parsed.type).toBe("widget.created");

		const manifest = loadManifest();
		expect(manifest[result.fixtureId]?.[result.apiVersion]).toBe(
			result.relPath,
		);
	});

	it("seeds the fixture from real captured bytes when rawBody is given", () => {
		const rawBody = Buffer.from(JSON.stringify({ real: "captured payload" }));
		const result = addFixture(TEST_PROVIDER, "widget.updated", { rawBody });
		const fixture = getFixture(result.fixtureId, result.apiVersion);
		expect(fixture.rawBody.equals(rawBody)).toBe(true);
	});

	it("does not overwrite an already-registered fixture", () => {
		const first = addFixture(TEST_PROVIDER, "widget.deleted");
		expect(first.alreadyExisted).toBe(false);
		const second = addFixture(TEST_PROVIDER, "widget.deleted");
		expect(second.alreadyExisted).toBe(true);
		expect(second.relPath).toBe(first.relPath);
	});

	it("reuses a sibling event's apiVersion when none is specified", () => {
		const first = addFixture(TEST_PROVIDER, "widget.created", {
			apiVersion: "v2",
		});
		const second = addFixture(TEST_PROVIDER, "widget.renamed");
		expect(second.apiVersion).toBe(first.apiVersion);
	});
});
