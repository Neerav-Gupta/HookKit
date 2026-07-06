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
	discord: (config: { secret: string }) => providerClient("discord", config),
	gitlab: (config: { secret: string }) => providerClient("gitlab", config),
	standardWebhooks: (config: { secret: string }) =>
		providerClient("standard-webhooks", config),
	/**
	 * Convenience aliases for Svix/Standard-Webhooks-powered services — as of
	 * this writing, Clerk, Resend, and Polar all use the Standard Webhooks
	 * spec under the hood, so `hookkit.provider("standard-webhooks", ...)`
	 * already works for them; these are just named shortcuts. Always confirm
	 * against the provider's current docs before relying on this, since
	 * implementations can change. If your provider isn't listed here (or
	 * above) but is Svix-powered, use `hookkit.standardWebhooks(...)` directly.
	 */
	clerk: (config: { secret: string }) =>
		providerClient("standard-webhooks", config),
	resend: (config: { secret: string }) =>
		providerClient("standard-webhooks", config),
	polar: (config: { secret: string }) =>
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
