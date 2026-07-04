import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Manifest shape: fixtureId ("provider/event.type") → apiVersion → file path
 * relative to the package root.
 */
export type FixtureManifest = Record<string, Record<string, string>>;

export interface Fixture {
	/** The exact bytes of the fixture file. Source of truth — never re-serialize. */
	rawBody: Buffer;
	fixtureId: string;
	apiVersion: string;
	/** Absolute path of the fixture file on disk. */
	path: string;
}

// The fixture files live on disk in this package; locate the package root
// even when this module is bundled into another package (e.g. the CLI):
// self-resolution via node_modules finds the real package directory. Falls
// back to the module location (src/ and dist/ are one level below the root).
const packageRoot = (() => {
	try {
		return dirname(
			createRequire(import.meta.url).resolve(
				"@hookkit-dev/fixtures/package.json",
			),
		);
	} catch {
		return join(dirname(fileURLToPath(import.meta.url)), "..");
	}
})();

export function loadManifest(): FixtureManifest {
	return JSON.parse(
		readFileSync(join(packageRoot, "manifest.json"), "utf8"),
	) as FixtureManifest;
}

export function fixturePackageRoot(): string {
	return packageRoot;
}

/** List every (fixtureId, apiVersion) pair shipped in the manifest. */
export function listFixtures(): { fixtureId: string; apiVersion: string }[] {
	const manifest = loadManifest();
	return Object.entries(manifest).flatMap(([fixtureId, versions]) =>
		Object.keys(versions).map((apiVersion) => ({ fixtureId, apiVersion })),
	);
}

/**
 * Load a fixture's exact bytes. When `apiVersion` is omitted the latest
 * version (lexicographically greatest, which sorts date-based versions
 * correctly) is used.
 */
export function getFixture(fixtureId: string, apiVersion?: string): Fixture {
	const manifest = loadManifest();
	const versions = manifest[fixtureId];
	if (!versions) {
		throw new Error(
			`Unknown fixture "${fixtureId}". Known: ${Object.keys(manifest).join(", ")}`,
		);
	}
	const version = apiVersion ?? Object.keys(versions).sort().at(-1);
	if (!version || !versions[version]) {
		throw new Error(
			`Fixture "${fixtureId}" has no apiVersion "${apiVersion}". Available: ${Object.keys(versions).join(", ")}`,
		);
	}
	const relPath = versions[version];
	const absPath = join(packageRoot, relPath);
	return {
		rawBody: readFileSync(absPath),
		fixtureId,
		apiVersion: version,
		path: absPath,
	};
}
