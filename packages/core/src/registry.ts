import { github } from "./adapters/github.js";
import { shopify } from "./adapters/shopify.js";
import { slack } from "./adapters/slack.js";
import { standardWebhooks } from "./adapters/standard-webhooks.js";
import { stripe } from "./adapters/stripe.js";
import type { ProviderAdapter } from "./types.js";

export class ProviderRegistry {
	private readonly adapters = new Map<string, ProviderAdapter>();

	register(adapter: ProviderAdapter): void {
		this.adapters.set(adapter.id, adapter);
	}

	get(id: string): ProviderAdapter {
		const adapter = this.adapters.get(id);
		if (!adapter) {
			throw new Error(
				`Unknown provider "${id}". Known providers: ${this.list()
					.map((a) => a.id)
					.join(", ")}`,
			);
		}
		return adapter;
	}

	has(id: string): boolean {
		return this.adapters.has(id);
	}

	list(): ProviderAdapter[] {
		return [...this.adapters.values()];
	}
}

/** The default registry with every built-in provider pre-registered. */
export const registry = new ProviderRegistry();
registry.register(stripe);
registry.register(github);
registry.register(shopify);
registry.register(slack);
registry.register(standardWebhooks);
