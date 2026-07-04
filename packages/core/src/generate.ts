import { getFixture } from "@hookkit-dev/fixtures";
import { deepMerge } from "./merge.js";
import { registry } from "./registry.js";
import type { GeneratedEvent, GenerateOptions } from "./types.js";

/**
 * EventGenerator — produce a provider-accurate webhook event from a bundled
 * fixture. RAW-BODY FIDELITY: when no overrides are given, the fixture's exact
 * bytes are used untouched. With overrides, the merged object is serialized
 * exactly ONCE; those bytes are then signed and delivered as-is.
 */
export function generate(
	provider: string,
	eventType: string,
	opts: GenerateOptions,
): GeneratedEvent {
	const adapter = registry.get(provider);
	const descriptor = adapter.events[eventType];
	if (!descriptor) {
		throw new Error(
			`Unknown event "${eventType}" for provider "${provider}". Known events: ${Object.keys(
				adapter.events,
			).join(", ")}`,
		);
	}

	const fixture = getFixture(descriptor.fixtureId, opts.apiVersion);

	let rawBody: Buffer;
	let parsed: unknown;
	if (opts.overrides && Object.keys(opts.overrides).length > 0) {
		parsed = deepMerge(
			JSON.parse(fixture.rawBody.toString("utf8")),
			opts.overrides,
		);
		rawBody = Buffer.from(JSON.stringify(parsed), "utf8");
	} else {
		rawBody = fixture.rawBody;
		parsed = JSON.parse(rawBody.toString("utf8"));
	}

	const headers: Record<string, string> = {
		"Content-Type": adapter.contentType,
		...(adapter.headersFor?.({
			eventType,
			rawBody,
			apiVersion: fixture.apiVersion,
		}) ?? {}),
		...adapter.sign({
			rawBody,
			secret: opts.secret,
			...(opts.timestamp !== undefined ? { timestamp: opts.timestamp } : {}),
		}),
	};

	return { rawBody, headers, parsed, eventType, provider };
}
