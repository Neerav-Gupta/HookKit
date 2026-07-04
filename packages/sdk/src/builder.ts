import {
	corruptSignature,
	type DeliveryResult,
	type DeliveryTarget,
	dispatch,
	type GeneratedEvent,
	generate,
	getHeader,
	registry,
} from "@hookkit-dev/core";

export interface EventOptions {
	overrides?: Record<string, unknown>;
	apiVersion?: string;
}

/**
 * Fluent builder over core's generate()+dispatch(). Mutators exist to test
 * FAILURE paths (tampered signatures, stale timestamps) as first-class cases.
 */
export class EventBuilder {
	private timestamp: number | undefined;
	private tampered = false;

	constructor(
		private readonly provider: string,
		private readonly eventType: string,
		private readonly secret: string,
		private readonly options: EventOptions = {},
	) {}

	/** Pin the signing timestamp (seconds). Also used to simulate stale deliveries. */
	withTimestamp(timestamp: number): this {
		this.timestamp = timestamp;
		return this;
	}

	/** Corrupt the signature header so the delivery MUST be rejected. */
	tamperSignature(): this {
		this.tampered = true;
		return this;
	}

	/** Produce the signed event (raw bytes + headers) without sending it. */
	build(): GeneratedEvent {
		const evt = generate(this.provider, this.eventType, {
			secret: this.secret,
			...(this.options.overrides !== undefined
				? { overrides: this.options.overrides }
				: {}),
			...(this.options.apiVersion !== undefined
				? { apiVersion: this.options.apiVersion }
				: {}),
			...(this.timestamp !== undefined ? { timestamp: this.timestamp } : {}),
		});
		if (this.tampered) {
			const headerName = registry.get(this.provider).signatureHeader;
			for (const key of Object.keys(evt.headers)) {
				if (key.toLowerCase() === headerName.toLowerCase()) {
					evt.headers[key] = corruptSignature(evt.headers[key] ?? "");
				}
			}
		}
		return evt;
	}

	/** Sign and deliver to a URL or a FrameworkApp (via an adapter). */
	async sendTo(target: DeliveryTarget): Promise<DeliveryResult> {
		return dispatch(this.build(), target);
	}
}

export interface ProviderClient {
	event(eventType: string, options?: EventOptions): EventBuilder;
}

export function providerClient(
	provider: string,
	config: { secret: string },
): ProviderClient {
	// Fail fast on unknown providers (throws with the known-provider list).
	registry.get(provider);
	return {
		event: (eventType, options) =>
			new EventBuilder(provider, eventType, config.secret, options),
	};
}

export { getHeader };
