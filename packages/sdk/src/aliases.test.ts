import { registry } from "@hookkit-dev/core";
import { describe, expect, it } from "vitest";
import { hookkit } from "./index.js";

const secret = "whsec_alias_test_secret";

describe("sdk provider aliases", () => {
	it("hookkit.discord() and hookkit.gitlab() drive their own providers", () => {
		const discordEvt = hookkit
			.discord({ secret })
			.event("application_authorized")
			.build();
		expect(discordEvt.provider).toBe("discord");
		expect(
			registry.get("discord").verify({ ...discordEvt, secret }).valid,
		).toBe(true);

		const gitlabEvt = hookkit.gitlab({ secret }).event("push-hook").build();
		expect(gitlabEvt.provider).toBe("gitlab");
		expect(registry.get("gitlab").verify({ ...gitlabEvt, secret }).valid).toBe(
			true,
		);
	});

	it.each([
		"clerk",
		"resend",
		"polar",
	] as const)("hookkit.%s() is a standard-webhooks alias", (alias) => {
		const evt = hookkit[alias]({ secret }).event("invoice.paid").build();
		expect(evt.provider).toBe("standard-webhooks");
		expect(
			registry.get("standard-webhooks").verify({ ...evt, secret }).valid,
		).toBe(true);
	});
});
