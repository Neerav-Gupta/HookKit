export interface ProviderAdapter {
	id: string; // 'stripe'
	displayName: string; // 'Stripe'
	contentType: string; // 'application/json'
	signatureHeader: string; // 'Stripe-Signature'

	/** Compute the headers a real provider attaches to this exact raw body. */
	sign(input: {
		rawBody: Buffer;
		secret: string;
		timestamp?: number;
	}): Record<string, string>;

	/** Verify a received request (powers the `verify` CLI + round-trip tests). */
	verify(input: {
		rawBody: Buffer;
		headers: Record<string, string>;
		secret: string;
		toleranceSec?: number; // default 300
	}): { valid: boolean; reason?: string };

	/**
	 * OPTIONAL async equivalent of verify(), built on the standard Web Crypto
	 * API (globalThis.crypto.subtle) instead of node:crypto. Used only by
	 * edge-targeting production middleware (adapter-hono, adapter-next) so
	 * they run unmodified on Cloudflare Workers / Vercel Edge / Deno Deploy.
	 * `rawBody` is `Uint8Array` (not `Buffer`) since edge runtimes always have
	 * the former but not reliably the latter. Never used by testing/generation.
	 */
	verifyAsync?(input: {
		rawBody: Uint8Array;
		headers: Record<string, string>;
		secret: string;
		toleranceSec?: number;
	}): Promise<{ valid: boolean; reason?: string }>;

	/**
	 * Optional provider-realism headers that depend on the event rather than
	 * the body/secret (e.g. GitHub's X-GitHub-Event, Shopify's X-Shopify-Topic).
	 * Merged into generated events alongside sign()'s output.
	 */
	headersFor?(input: {
		eventType: string;
		rawBody: Buffer;
		apiVersion?: string;
	}): Record<string, string>;

	events: Record<string, EventDescriptor>;
	retryPolicy: RetrySchedule;
}

export interface EventDescriptor {
	fixtureId: string; // key into @hookkit-dev/fixtures
	schema?: unknown; // JSON Schema; used by fixture validation + drift detection
	apiVersions?: string[];
}

export interface RetrySchedule {
	maxAttempts: number;
	windowSec: number;
	backoff: "exponential" | "fixed" | "custom";
	delaysSec?: number[]; // required iff backoff === 'custom'
}

export interface GeneratedEvent {
	rawBody: Buffer; // sign & send THESE bytes; never re-serialize
	headers: Record<string, string>;
	parsed: unknown; // convenience view; not used for signing
	eventType: string;
	provider: string;
}

export interface GenerateOptions {
	overrides?: Record<string, unknown>; // deep-merged into the fixture
	apiVersion?: string;
	timestamp?: number; // pin for deterministic tests
	secret: string;
}

/**
 * A network-free delivery target implemented by the framework adapter
 * packages (@hookkit-dev/adapter-express, …). `inject` must hand the exact
 * request bytes to the app without any serialization round-trip.
 */
export interface FrameworkApp {
	inject(request: {
		method: string;
		url: string;
		headers: Record<string, string>;
		body: Buffer;
	}): Promise<{
		status: number;
		body: string;
		headers: Record<string, string>;
	}>;
}

export type DeliveryTarget = string /* URL */ | FrameworkApp /* via adapter */;

export interface DeliveryResult {
	status: number;
	body: string;
	headers: Record<string, string>;
	ms: number;
}
