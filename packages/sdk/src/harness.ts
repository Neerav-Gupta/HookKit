/**
 * SDK harness surface — adapts EventBuilders to core's correctness harness:
 *
 *   await hookkit.harness.idempotency(builder, target, { times: 3 });
 *   await hookkit.harness.malformed(builder, target, { kind: "badSignature" });
 */
import {
	harness as coreHarness,
	type DeliveryTarget,
	type EventFactory,
	type GeneratedEvent,
	type HarnessReport,
	type MalformedKind,
} from "@hookkit-dev/core";
import type { EventBuilder } from "./builder.js";

type BuilderOrEvent = EventBuilder | GeneratedEvent;

function isBuilder(value: BuilderOrEvent): value is EventBuilder {
	return typeof (value as EventBuilder).build === "function";
}

function toEvent(value: BuilderOrEvent): GeneratedEvent {
	return isBuilder(value) ? value.build() : value;
}

function toFactory(builder: EventBuilder): EventFactory {
	return (opts) =>
		opts?.timestamp !== undefined
			? builder.withTimestamp(opts.timestamp).build()
			: builder.build();
}

export const harness = {
	/** Same event delivered `times` times — every duplicate must be accepted. */
	idempotency(
		builderOrEvent: BuilderOrEvent,
		target: DeliveryTarget,
		opts: { times?: number } = {},
	): Promise<HarnessReport> {
		return coreHarness.idempotency(toEvent(builderOrEvent), target, opts);
	},

	/** Provider-style redelivery until acceptance; optionally assert fail/then. */
	retry(
		builder: EventBuilder,
		target: DeliveryTarget,
		opts: { fail?: number; then?: number; maxAttempts?: number } = {},
	): Promise<HarnessReport> {
		return coreHarness.retry(toFactory(builder), target, opts);
	},

	/** Out-of-order delivery — handlers must not depend on arrival order. */
	ordering(
		builders: BuilderOrEvent[],
		target: DeliveryTarget,
	): Promise<HarnessReport> {
		return coreHarness.ordering(builders.map(toEvent), target);
	},

	/** Deliberately broken delivery — the handler must reject it. */
	malformed(
		builder: EventBuilder,
		target: DeliveryTarget,
		opts: { kind: MalformedKind },
	): Promise<HarnessReport> {
		return coreHarness.malformed(toFactory(builder), target, opts);
	},
};
