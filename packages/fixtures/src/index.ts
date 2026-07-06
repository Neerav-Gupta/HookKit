import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

export interface AddFixtureOptions {
	apiVersion?: string;
	/**
	 * Real captured bytes to seed the fixture with (e.g. from the inspector's
	 * "save as fixture" feature). Omit to write a placeholder skeleton for a
	 * contributor to fill in by hand.
	 */
	rawBody?: Buffer;
}

export interface AddFixtureResult {
	fixtureId: string;
	apiVersion: string;
	/** Path relative to this package's root, as stored in manifest.json. */
	relPath: string;
	/** True if fixtureId@apiVersion was already registered — nothing was written. */
	alreadyExisted: boolean;
}

/**
 * Scaffold (or seed from real captured bytes) a fixture and register it in
 * manifest.json. Shared by the CLI's `fixtures add` command and the
 * inspector's "save as fixture" capability — both packages depend on
 * @hookkit-dev/fixtures directly, avoiding a circular dependency between them
 * (the CLI already depends on the inspector for `hookkit inspect`).
 */
export function addFixture(
	provider: string,
	eventType: string,
	options: AddFixtureOptions = {},
): AddFixtureResult {
	const manifestPath = join(packageRoot, "manifest.json");
	const manifest = loadManifest();

	const fixtureId = `${provider}/${eventType}`;
	// Reuse the provider's existing version dir when the flag is omitted.
	const siblingVersion = Object.entries(manifest).find(([id]) =>
		id.startsWith(`${provider}/`),
	)?.[1];
	const apiVersion: string =
		options.apiVersion ??
		(siblingVersion ? Object.keys(siblingVersion)[0] : undefined) ??
		"v1";
	const existingRelPath = manifest[fixtureId]?.[apiVersion];
	if (existingRelPath) {
		return {
			fixtureId,
			apiVersion,
			relPath: existingRelPath,
			alreadyExisted: true,
		};
	}

	const fileName = `${eventType.replaceAll("/", "-")}.json`;
	const relPath = `fixtures/${provider}/${apiVersion}/${fileName}`;
	const absPath = join(packageRoot, relPath);
	if (!existsSync(absPath)) {
		mkdirSync(dirname(absPath), { recursive: true });
		const content =
			options.rawBody ??
			Buffer.from(
				`${JSON.stringify(
					{
						"//": `SYNTHETIC ${provider} ${eventType} payload — no real PII, tokens, or secrets. Replace with the provider's documented shape, then delete this key.`,
						type: eventType,
					},
					null,
					2,
				)}\n`,
			);
		writeFileSync(absPath, content);
	}

	manifest[fixtureId] = { ...manifest[fixtureId], [apiVersion]: relPath };
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);

	return { fixtureId, apiVersion, relPath, alreadyExisted: false };
}
