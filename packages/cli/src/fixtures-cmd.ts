/**
 * `hookkit fixtures add <provider> <event>` — contributor scaffolder.
 * `hookkit fixtures save-from-inspector <requestId> ...` — capture → fixture
 * loop: pulls a real captured request from a running inspector and saves it
 * as a fixture.
 *
 * Saving a fixture under an event type the provider's adapter ALREADY knows
 * (e.g. a new API-version variant of an existing event) is immediately
 * usable via `hookkit trigger`/replay — no code changes. Saving a genuinely
 * NEW event type still needs one manual step: registering it in the
 * adapter's `events` map (the fixtureId/apiVersion are already set up).
 *
 * The actual fixture-writing logic lives in @hookkit-dev/fixtures (shared
 * with the inspector's own "save as fixture" endpoint, since the inspector
 * can't depend on this package — the CLI already depends on the inspector
 * for `hookkit inspect`, and a dependency the other way would be circular).
 */
import { registry } from "@hookkit-dev/core";
import { type AddFixtureOptions, addFixture } from "@hookkit-dev/fixtures";
import type { CommandResult } from "./commands.js";

export type FixturesAddOptions = AddFixtureOptions;

function isKnownEvent(provider: string, eventType: string): boolean {
	return registry.has(provider) && eventType in registry.get(provider).events;
}

export function fixturesAdd(
	provider: string,
	eventType: string,
	options: FixturesAddOptions = {},
): CommandResult {
	const result = addFixture(provider, eventType, options);
	if (result.alreadyExisted) {
		return {
			exitCode: 1,
			output: [
				`error: fixture ${result.fixtureId}@${result.apiVersion} already exists`,
			],
		};
	}

	if (options.rawBody) {
		const known = isKnownEvent(provider, eventType);
		return {
			exitCode: 0,
			output: [
				`saved ${result.relPath} from captured bytes`,
				`registered ${result.fixtureId}@${result.apiVersion} in manifest.json`,
				"",
				known
					? `ready to use: hookkit trigger ${provider} ${eventType} --api-version ${result.apiVersion}`
					: `next step: register "${eventType}" in packages/core/src/adapters/${provider}.ts's ` +
						`events map (fixtureId/apiVersion are already set) to make it triggerable`,
				"review the fixture for anything sensitive — replace with synthetic values if needed",
			],
		};
	}

	return {
		exitCode: 0,
		output: [
			`created ${result.relPath}`,
			`registered ${result.fixtureId}@${result.apiVersion} in manifest.json`,
			"",
			"next steps:",
			"  1. Fill in the payload (synthetic data only — CI gate enforces the schema).",
			`  2. Register the event in packages/core/src/adapters/${provider}.ts with a schema.`,
			"  3. pnpm --filter @hookkit-dev/core test   # conformance + fixture gate must pass",
		],
	};
}

export interface SaveFromInspectorOptions {
	inspectorUrl: string;
	provider: string;
	eventType: string;
	apiVersion?: string;
}

/**
 * Fetch a captured request from a running inspector and save it as a
 * fixture — the scriptable/non-UI counterpart to the inspector's "Save as
 * fixture" button. POSTs to the inspector's own endpoint rather than reading
 * its SQLite file directly, keeping DB access encapsulated there.
 */
export async function fixturesSaveFromInspector(
	requestId: string,
	options: SaveFromInspectorOptions,
): Promise<CommandResult> {
	const base = options.inspectorUrl.replace(/\/$/, "");
	const res = await fetch(`${base}/api/requests/${requestId}/save-fixture`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			provider: options.provider,
			eventType: options.eventType,
			...(options.apiVersion ? { apiVersion: options.apiVersion } : {}),
		}),
	});
	const body = (await res.json().catch(() => ({}))) as {
		error?: string;
		relPath?: string;
		fixtureId?: string;
		apiVersion?: string;
	};
	if (!res.ok) {
		return { exitCode: 1, output: [`error: ${body.error ?? res.statusText}`] };
	}

	const known = isKnownEvent(options.provider, options.eventType);
	return {
		exitCode: 0,
		output: [
			`saved ${body.relPath} from captured request ${requestId}`,
			`registered ${body.fixtureId}@${body.apiVersion} in manifest.json`,
			known
				? `ready to use: hookkit trigger ${options.provider} ${options.eventType} --api-version ${body.apiVersion}`
				: `next step: register "${options.eventType}" in packages/core/src/adapters/${options.provider}.ts's ` +
					`events map (fixtureId/apiVersion are already set) to make it triggerable`,
		],
	};
}
