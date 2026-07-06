/**
 * CLI command implementations, kept separate from the cac wiring so tests can
 * call them directly. All commands are OFFLINE: they only talk to the URL the
 * user explicitly passes (typically loopback). Secrets are never printed.
 */
import { readFileSync } from "node:fs";
import {
	detectSchemaDrift,
	dispatch,
	generate,
	registry,
	setPath,
} from "@hookkit-dev/core";
import { loadConfig, resolveSecret, resolveTarget } from "./config.js";

export interface CommandResult {
	exitCode: number;
	output: string[];
}

function parseSetValue(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw; // bare strings need no quoting: --set currency=eur
	}
}

export interface TriggerOptions {
	to?: string;
	secret?: string;
	set?: string | string[];
	apiVersion?: string;
	cwd?: string;
}

export async function trigger(
	provider: string,
	eventType: string,
	options: TriggerOptions,
): Promise<CommandResult> {
	const config = await loadConfig(options.cwd);
	const secret = resolveSecret(provider, options.secret, config);
	if (!secret) {
		return {
			exitCode: 1,
			output: [
				`error: no secret for "${provider}". Pass --secret, add secrets.${provider} to hookkit.config, or set HOOKKIT_${provider.toUpperCase().replaceAll("-", "_")}_SECRET.`,
			],
		};
	}
	const target = resolveTarget(options.to, config);
	if (!target) {
		return { exitCode: 1, output: ["error: no target. Pass --to <url>."] };
	}

	const overrides: Record<string, unknown> = {};
	// cac yields [undefined] for a repeatable option that was never passed.
	const sets = [options.set]
		.flat()
		.filter(
			(entry): entry is string => typeof entry === "string" && entry.length > 0,
		);
	for (const entry of sets) {
		const eq = entry.indexOf("=");
		if (eq === -1) {
			return {
				exitCode: 1,
				output: [`error: --set expects path=value, got "${entry}"`],
			};
		}
		setPath(overrides, entry.slice(0, eq), parseSetValue(entry.slice(eq + 1)));
	}

	const evt = generate(provider, eventType, {
		secret,
		...(Object.keys(overrides).length > 0 ? { overrides } : {}),
		...(options.apiVersion !== undefined
			? { apiVersion: options.apiVersion }
			: {}),
	});
	const result = await dispatch(evt, target);
	const ok = result.status >= 200 && result.status < 300;
	return {
		exitCode: ok ? 0 : 1,
		output: [
			`→ POST ${target}`,
			`  ${provider} ${eventType} (${evt.rawBody.length} bytes)`,
			`← ${result.status} in ${result.ms.toFixed(0)}ms`,
			...(ok ? [] : [`  body: ${result.body.slice(0, 300)}`]),
		],
	};
}

export interface ReplayOptions {
	to?: string;
	cwd?: string;
}

/**
 * Replay a captured request from a JSON file (as saved by the inspector's
 * export, or hand-written): { headers: {...}, body: "..." } or
 * { headers: {...}, bodyBase64: "..." }.
 */
export async function replay(
	source: string,
	options: ReplayOptions,
): Promise<CommandResult> {
	const config = await loadConfig(options.cwd);
	const target = resolveTarget(options.to, config);
	if (!target) {
		return { exitCode: 1, output: ["error: no target. Pass --to <url>."] };
	}

	let capture: {
		headers?: Record<string, string>;
		body?: string;
		bodyBase64?: string;
	};
	try {
		capture = JSON.parse(readFileSync(source, "utf8"));
	} catch (err) {
		return {
			exitCode: 1,
			output: [
				`error: could not read capture file "${source}": ${(err as Error).message}`,
				"hint: inspector request ids can be replayed from the inspector UI or exported to a file first.",
			],
		};
	}
	const rawBody = capture.bodyBase64
		? Buffer.from(capture.bodyBase64, "base64")
		: Buffer.from(capture.body ?? "", "utf8");

	const result = await dispatch(
		{
			rawBody,
			headers: capture.headers ?? {},
			parsed: undefined,
			eventType: "replay",
			provider: "replay",
		},
		target,
	);
	const ok = result.status >= 200 && result.status < 300;
	return {
		exitCode: ok ? 0 : 1,
		output: [
			`→ POST ${target} (replay of ${source}, ${rawBody.length} bytes)`,
			`← ${result.status} in ${result.ms.toFixed(0)}ms`,
		],
	};
}

export function listProviders(): CommandResult {
	const rows = registry
		.list()
		.map(
			(adapter) =>
				`${adapter.id.padEnd(20)} ${adapter.displayName.padEnd(20)} ${Object.keys(adapter.events).length} event(s)`,
		);
	return { exitCode: 0, output: rows };
}

export function listEvents(provider: string): CommandResult {
	if (!registry.has(provider)) {
		return {
			exitCode: 1,
			output: [
				`error: unknown provider "${provider}". Known: ${registry
					.list()
					.map((a) => a.id)
					.join(", ")}`,
			],
		};
	}
	const adapter = registry.get(provider);
	const rows = Object.entries(adapter.events).map(([eventType, descriptor]) => {
		const versions = descriptor.apiVersions?.join(", ") ?? "latest";
		return `${eventType.padEnd(36)} ${versions}`;
	});
	return { exitCode: 0, output: rows };
}

export interface VerifyOptions {
	body?: string;
	header?: string | string[];
	secret?: string;
	tolerance?: number;
	cwd?: string;
}

export async function verify(
	provider: string,
	options: VerifyOptions,
): Promise<CommandResult> {
	if (!registry.has(provider)) {
		return { exitCode: 1, output: [`error: unknown provider "${provider}"`] };
	}
	const config = await loadConfig(options.cwd);
	const secret = resolveSecret(provider, options.secret, config);
	if (!secret) {
		return {
			exitCode: 1,
			output: [`error: no secret for "${provider}". Pass --secret.`],
		};
	}
	if (!options.body) {
		return { exitCode: 1, output: ["error: --body @file is required"] };
	}
	const rawBody = options.body.startsWith("@")
		? readFileSync(options.body.slice(1))
		: Buffer.from(options.body, "utf8");

	const headers: Record<string, string> = {};
	for (const entry of options.header === undefined
		? []
		: [options.header].flat()) {
		const colon = entry.indexOf(":");
		if (colon === -1) {
			return {
				exitCode: 1,
				output: [`error: --header expects "Name: value", got "${entry}"`],
			};
		}
		headers[entry.slice(0, colon).trim()] = entry.slice(colon + 1).trim();
	}

	const result = registry.get(provider).verify({
		rawBody,
		headers,
		secret,
		...(options.tolerance !== undefined
			? { toleranceSec: options.tolerance }
			: {}),
	});
	if (!result.valid) {
		return { exitCode: 1, output: [`invalid ✗  (${result.reason})`] };
	}

	const output = ["valid ✓"];
	// Non-fatal: a schema-drift warning never changes verify's exit code.
	try {
		const parsedBody: unknown = JSON.parse(rawBody.toString("utf8"));
		const drift = detectSchemaDrift(provider, { headers, parsedBody });
		if (drift.checked && !drift.matched) {
			output.push(
				`⚠ schema drift: payload for "${drift.eventType}" no longer matches the known schema` +
					` (possible API version change) — ${(drift.errors ?? []).join("; ")}`,
			);
		}
	} catch {
		// Non-JSON body: schema-drift detection doesn't apply, nothing to warn about.
	}
	return { exitCode: 0, output };
}
