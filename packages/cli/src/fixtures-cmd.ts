/**
 * `hookkit fixtures add <provider> <event>` — contributor scaffolder: writes a
 * skeleton fixture into @hookkit-dev/fixtures and registers it in the
 * manifest. The fixture-schema CI gate then forces the payload and the
 * adapter's schema to agree before it can ship.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { CommandResult } from "./commands.js";

export interface FixturesAddOptions {
	apiVersion?: string;
}

function fixturesPackageRoot(): string {
	return dirname(
		createRequire(import.meta.url).resolve(
			"@hookkit-dev/fixtures/package.json",
		),
	);
}

export function fixturesAdd(
	provider: string,
	eventType: string,
	options: FixturesAddOptions = {},
): CommandResult {
	const root = fixturesPackageRoot();
	const manifestPath = join(root, "manifest.json");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
		string,
		Record<string, string>
	>;

	const fixtureId = `${provider}/${eventType}`;
	// Reuse the provider's existing version dir when the flag is omitted.
	const siblingVersion = Object.entries(manifest).find(([id]) =>
		id.startsWith(`${provider}/`),
	)?.[1];
	const apiVersion =
		options.apiVersion ??
		(siblingVersion ? Object.keys(siblingVersion)[0] : "v1");
	if (manifest[fixtureId]?.[apiVersion as string]) {
		return {
			exitCode: 1,
			output: [`error: fixture ${fixtureId}@${apiVersion} already exists`],
		};
	}

	const fileName = `${eventType.replaceAll("/", "-")}.json`;
	const relPath = `fixtures/${provider}/${apiVersion}/${fileName}`;
	const absPath = join(root, relPath);
	if (!existsSync(absPath)) {
		mkdirSync(dirname(absPath), { recursive: true });
		const skeleton = {
			"//": `SYNTHETIC ${provider} ${eventType} payload — no real PII, tokens, or secrets. Replace with the provider's documented shape, then delete this key.`,
			type: eventType,
		};
		writeFileSync(absPath, `${JSON.stringify(skeleton, null, 2)}\n`);
	}

	manifest[fixtureId] = {
		...manifest[fixtureId],
		[apiVersion as string]: relPath,
	};
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);

	return {
		exitCode: 0,
		output: [
			`created ${relPath}`,
			`registered ${fixtureId}@${apiVersion} in manifest.json`,
			"",
			"next steps:",
			`  1. Fill in the payload (synthetic data only — CI gate enforces the schema).`,
			`  2. Register the event in packages/core/src/adapters/${provider}.ts with a schema.`,
			`  3. pnpm --filter @hookkit-dev/core test   # conformance + fixture gate must pass`,
		],
	};
}
