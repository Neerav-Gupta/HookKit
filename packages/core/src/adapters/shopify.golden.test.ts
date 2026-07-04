import "@shopify/shopify-api/adapters/node";
import { generate } from "@hookkit-dev/core";
import { ApiVersion, shopifyApi } from "@shopify/shopify-api"; // dev-dependency, ORACLE only
import { expect, it } from "vitest";

const secret = "shpss_test_secret";

function oracle() {
	return shopifyApi({
		apiKey: "test-key",
		apiSecretKey: secret,
		scopes: [],
		hostName: "localhost",
		isEmbeddedApp: false,
		apiVersion: ApiVersion.April25,
	});
}

function toRawRequest(headers: Record<string, string>) {
	return {
		method: "POST",
		url: "/webhooks",
		headers: Object.fromEntries(
			Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
		),
	};
}

it("shopify: generated event validates with the official @shopify/shopify-api", async () => {
	const evt = generate("shopify", "orders/create", { secret });
	const result = await oracle().webhooks.validate({
		rawBody: evt.rawBody.toString("utf8"),
		rawRequest: toRawRequest(evt.headers),
	});
	expect(result.valid).toBe(true);
});

it("shopify: tampered body is rejected by the official @shopify/shopify-api", async () => {
	const evt = generate("shopify", "orders/create", { secret });
	const result = await oracle().webhooks.validate({
		rawBody: `${evt.rawBody.toString("utf8")} `,
		rawRequest: toRawRequest(evt.headers),
	});
	expect(result.valid).toBe(false);
});
