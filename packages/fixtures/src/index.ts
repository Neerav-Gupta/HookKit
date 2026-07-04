import { readFileSync } from "node:fs";
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

// Works from both src/ (tests run against TS source) and dist/ (built output);
// each is one level below the package root. tsup `shims` provides
// import.meta.url in the CJS build.
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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
