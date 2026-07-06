import { describe, expect, it } from "vitest";
import { detectSchemaDrift } from "./schema-drift.js";

describe("detectSchemaDrift", () => {
	it("matches a well-formed Stripe payload", () => {
		const parsedBody = {
			id: "evt_test_1",
			object: "event",
			api_version: "2025-04-10",
			created: 1710000000,
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_test_1",
					object: "checkout.session",
					status: "complete",
				},
			},
		};
		const result = detectSchemaDrift("stripe", { headers: {}, parsedBody });
		expect(result).toEqual({
			checked: true,
			matched: true,
			eventType: "checkout.session.completed",
		});
	});

	it("flags drift when a real payload no longer matches the known schema", () => {
		const parsedBody = {
			id: "evt_test_1",
			object: "event",
			api_version: "2025-04-10",
			created: 1710000000,
			type: "checkout.session.completed",
			data: { object: { object: "checkout.session" } }, // missing required `id`/`status`
		};
		const result = detectSchemaDrift("stripe", { headers: {}, parsedBody });
		expect(result.checked).toBe(true);
		expect(result.matched).toBe(false);
		expect(result.errors?.length).toBeGreaterThan(0);
	});

	it("identifies GitHub events from the X-GitHub-Event header, not the body", () => {
		const result = detectSchemaDrift("github", {
			headers: { "X-GitHub-Event": "push" },
			parsedBody: {
				ref: "refs/heads/main",
				before: "0",
				after: "1",
				repository: {
					id: 1,
					name: "x",
					full_name: "a/x",
					owner: { login: "a" },
				},
				pusher: { name: "a" },
				commits: [],
			},
		});
		expect(result).toEqual({ checked: true, matched: true, eventType: "push" });
	});

	it("reports checked:false when the event type can't be identified", () => {
		const result = detectSchemaDrift("github", { headers: {}, parsedBody: {} });
		expect(result).toEqual({ checked: false });
	});

	it("reports checked:false when the body doesn't have a type field to identify from", () => {
		const result = detectSchemaDrift("stripe", {
			headers: {},
			parsedBody: null,
		});
		expect(result.checked).toBe(false);
	});
});
