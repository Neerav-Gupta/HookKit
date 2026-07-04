import { providerClient } from "./builder.js";
import { harness } from "./harness.js";

/**
 * The test-native HookKit SDK surface:
 *
 *   const stripe = hookkit.stripe({ secret });
 *   const res = await stripe.event("checkout.session.completed").sendTo(target);
 *   expect(res).toBeAccepted();
 */
export const hookkit = {
	/** Generic entry point for any registered provider id. */
	provider: providerClient,
	stripe: (config: { secret: string }) => providerClient("stripe", config),
	github: (config: { secret: string }) => providerClient("github", config),
	shopify: (config: { secret: string }) => providerClient("shopify", config),
	slack: (config: { secret: string }) => providerClient("slack", config),
	standardWebhooks: (config: { secret: string }) =>
		providerClient("standard-webhooks", config),
	/** Correctness harness: idempotency, retry, ordering, malformed. */
	harness,
};

export type {
	DeliveryResult,
	DeliveryTarget,
	FrameworkApp,
	GeneratedEvent,
	HarnessReport,
	MalformedKind,
} from "@hookkit-dev/core";
export {
	EventBuilder,
	type EventOptions,
	type ProviderClient,
	providerClient,
} from "./builder.js";
export { harness } from "./harness.js";
export { type HookkitMatchers, matchers } from "./matchers.js";
