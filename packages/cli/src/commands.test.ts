import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registry } from "@hookkit-dev/core";
import { afterAll, describe, expect, it } from "vitest";
import {
	listEvents,
	listProviders,
	replay,
	trigger,
	verify,
} from "./commands.js";
import { resolveSecret } from "./config.js";

const secret = "whsec_cli_test";

// Loopback receiver verifying Stripe signatures — the CLI's only traffic.
const captured: { rawBody: Buffer; headers: Record<string, string> }[] = [];
const server = createServer((req, res) => {
	const chunks: Buffer[] = [];
	req.on("data", (chunk) => chunks.push(chunk));
	req.on("end", () => {
		const rawBody = Buffer.concat(chunks);
		const headers = Object.fromEntries(
			Object.entries(req.headers).map(([key, value]) => [key, String(value)]),
		);
		captured.push({ rawBody, headers });
		const result = registry.get("stripe").verify({ rawBody, headers, secret });
		res.statusCode = result.valid ? 200 : 400;
		res.end(JSON.stringify(result));
	});
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/`;

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("hookkit trigger", () => {
	it("delivers a signed event that the receiver verifies", async () => {
		const result = await trigger("stripe", "checkout.session.completed", {
			to: url,
			secret,
		});
		expect(result.output.join("\n")).toContain("← 200");
		expect(result.exitCode).toBe(0);
	});

	it("applies --set overrides via dot-paths", async () => {
		captured.length = 0;
		const result = await trigger("stripe", "checkout.session.completed", {
			to: url,
			secret,
			set: ["data.object.amount_total=555", "data.object.currency=eur"],
		});
		expect(result.exitCode).toBe(0);
		const body = JSON.parse(captured[0]?.rawBody.toString("utf8") ?? "{}");
		expect(body.data.object.amount_total).toBe(555);
		expect(body.data.object.currency).toBe("eur");
	});

	it("never prints the secret", async () => {
		const result = await trigger("stripe", "checkout.session.completed", {
			to: url,
			secret,
		});
		expect(result.output.join("\n")).not.toContain(secret);
	});

	it("fails cleanly without a secret", async () => {
		const result = await trigger("stripe", "checkout.session.completed", {
			to: url,
			cwd: tmpdir(),
		});
		expect(result.exitCode).toBe(1);
		expect(result.output.join("\n")).toContain("no secret");
	});
});

describe("hookkit list", () => {
	it("lists all five providers", () => {
		const result = listProviders();
		expect(result.exitCode).toBe(0);
		const text = result.output.join("\n");
		for (const id of [
			"stripe",
			"github",
			"shopify",
			"slack",
			"standard-webhooks",
		]) {
			expect(text).toContain(id);
		}
	});

	it("lists events for a provider", () => {
		const result = listEvents("stripe");
		expect(result.output.join("\n")).toContain("checkout.session.completed");
	});

	it("errors on unknown provider", () => {
		expect(listEvents("nope").exitCode).toBe(1);
	});
});

describe("hookkit verify", () => {
	it("verifies a signed body from a file", async () => {
		const dir = mkdtempSync(join(tmpdir(), "hookkit-verify-"));
		const { generate } = await import("@hookkit-dev/core");
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const bodyFile = join(dir, "body.json");
		writeFileSync(bodyFile, evt.rawBody);
		const result = await verify("stripe", {
			body: `@${bodyFile}`,
			header: [`Stripe-Signature: ${evt.headers["Stripe-Signature"]}`],
			secret,
		});
		expect(result.output).toEqual(["valid ✓"]);
		expect(result.exitCode).toBe(0);
	});

	it("rejects a bad signature with a reason", async () => {
		const result = await verify("stripe", {
			body: "{}",
			header: ["Stripe-Signature: t=1,v1=deadbeef"],
			secret,
		});
		expect(result.exitCode).toBe(1);
		expect(result.output.join("\n")).toContain("invalid");
	});

	it("warns (non-fatally) when a valid payload has drifted from the known schema", async () => {
		const { registry } = await import("@hookkit-dev/core");
		const malformed = Buffer.from(
			JSON.stringify({
				id: "evt_test_0000000000",
				object: "event",
				api_version: "2025-04-10",
				created: 1710000000,
				type: "checkout.session.completed",
				data: { object: { object: "checkout.session" } }, // missing required id/status
			}),
		);
		const dir = mkdtempSync(join(tmpdir(), "hookkit-verify-drift-"));
		const bodyFile = join(dir, "body.json");
		writeFileSync(bodyFile, malformed);
		const signatureHeader = registry
			.get("stripe")
			.sign({ rawBody: malformed, secret })["Stripe-Signature"];
		const result = await verify("stripe", {
			body: `@${bodyFile}`,
			header: [`Stripe-Signature: ${signatureHeader}`],
			secret,
		});
		expect(result.exitCode).toBe(0); // schema drift never fails verify
		expect(result.output[0]).toBe("valid ✓");
		expect(result.output.join("\n")).toContain("schema drift");
	});
});

describe("hookkit replay", () => {
	it("re-delivers a captured request verbatim", async () => {
		const { generate } = await import("@hookkit-dev/core");
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const dir = mkdtempSync(join(tmpdir(), "hookkit-replay-"));
		const captureFile = join(dir, "capture.json");
		writeFileSync(
			captureFile,
			JSON.stringify({
				headers: evt.headers,
				bodyBase64: evt.rawBody.toString("base64"),
			}),
		);
		captured.length = 0;
		const result = await replay(captureFile, { to: url });
		expect(result.exitCode).toBe(0);
		expect(captured[0]?.rawBody.equals(evt.rawBody)).toBe(true);
	});
});

describe("config resolution", () => {
	it("prefers flag over config over env", () => {
		const env = { HOOKKIT_STRIPE_SECRET: "env-secret" } as NodeJS.ProcessEnv;
		expect(
			resolveSecret(
				"stripe",
				"flag-secret",
				{ secrets: { stripe: "cfg" } },
				env,
			),
		).toBe("flag-secret");
		expect(
			resolveSecret("stripe", undefined, { secrets: { stripe: "cfg" } }, env),
		).toBe("cfg");
		expect(resolveSecret("stripe", undefined, {}, env)).toBe("env-secret");
		expect(
			resolveSecret("stripe", undefined, {}, {
				HOOKKIT_SECRET: "generic",
			} as NodeJS.ProcessEnv),
		).toBe("generic");
	});
});
