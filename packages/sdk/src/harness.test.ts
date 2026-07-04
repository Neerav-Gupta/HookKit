import { createServer, type Server } from "node:http";
import { registry } from "@hookkit-dev/core";
import { afterAll, describe, expect, it } from "vitest";
import { hookkit } from "./index.js";

const secret = "whsec_harness_test";
const stripe = hookkit.stripe({ secret });

type Handler = (input: {
	rawBody: Buffer;
	headers: Record<string, string>;
}) => number;

const servers: Server[] = [];
async function serve(handler: Handler): Promise<string> {
	const server = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => {
			const headers = Object.fromEntries(
				Object.entries(req.headers).map(([key, value]) => [key, String(value)]),
			);
			res.statusCode = handler({ rawBody: Buffer.concat(chunks), headers });
			res.end();
		});
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/`;
}

afterAll(async () => {
	await Promise.all(
		servers.map(
			(server) => new Promise<void>((resolve) => server.close(() => resolve())),
		),
	);
});

function verified(input: {
	rawBody: Buffer;
	headers: Record<string, string>;
}): boolean {
	return registry.get("stripe").verify({ ...input, secret }).valid;
}

function eventId(rawBody: Buffer): string {
	return (JSON.parse(rawBody.toString("utf8")) as { id: string }).id;
}

describe("harness.idempotency (M5 acceptance)", () => {
	it("PASSES an idempotent handler", async () => {
		const seen = new Set<string>();
		const url = await serve(({ rawBody, headers }) => {
			if (!verified({ rawBody, headers })) return 400;
			seen.add(eventId(rawBody)); // duplicate-safe: Set.add is a no-op on repeats
			return 200;
		});
		const report = await hookkit.harness.idempotency(
			stripe.event("checkout.session.completed"),
			url,
			{ times: 3 },
		);
		expect(report.detail).toContain("idempotent");
		expect(report.pass).toBe(true);
	});

	it("FAILS a deliberately non-idempotent handler", async () => {
		const seen = new Set<string>();
		const url = await serve(({ rawBody, headers }) => {
			if (!verified({ rawBody, headers })) return 400;
			const id = eventId(rawBody);
			if (seen.has(id)) return 500; // simulated unique-constraint crash
			seen.add(id);
			return 200;
		});
		const report = await hookkit.harness.idempotency(
			stripe.event("checkout.session.completed"),
			url,
			{ times: 2 },
		);
		expect(report.pass).toBe(false);
		expect(report.detail).toContain("rejected a duplicate");
	});
});

describe("harness.retry", () => {
	it("passes a handler that recovers after transient failures", async () => {
		let calls = 0;
		const url = await serve(() => (++calls <= 2 ? 503 : 200));
		const report = await hookkit.harness.retry(
			stripe.event("checkout.session.completed"),
			url,
			// biome-ignore lint/suspicious/noThenProperty: `then` is the harness API from the build brief
			{ fail: 2, then: 200 },
		);
		expect(report.pass).toBe(true);
		expect(report.results.map((r) => r.status)).toEqual([503, 503, 200]);
	});

	it("fails a handler that never recovers", async () => {
		const url = await serve(() => 500);
		const report = await hookkit.harness.retry(
			stripe.event("checkout.session.completed"),
			url,
			{ maxAttempts: 3 },
		);
		expect(report.pass).toBe(false);
	});
});

describe("harness.ordering", () => {
	it("passes an order-independent handler", async () => {
		const url = await serve(({ rawBody, headers }) =>
			verified({ rawBody, headers }) ? 200 : 400,
		);
		const report = await hookkit.harness.ordering(
			[
				stripe.event("checkout.session.completed"),
				stripe.event("checkout.session.completed", {
					overrides: { id: "evt_test_0000000001" },
				}),
			],
			url,
		);
		expect(report.pass).toBe(true);
	});
});

describe("harness.malformed", () => {
	const strictHandler: Handler = ({ rawBody, headers }) => {
		if (headers["content-type"] !== "application/json") return 415;
		const result = registry.get("stripe").verify({ rawBody, headers, secret });
		return result.valid ? 200 : 400;
	};

	for (const kind of [
		"truncated",
		"expiredTimestamp",
		"badSignature",
	] as const) {
		it(`passes a strict handler on ${kind}`, async () => {
			const url = await serve(strictHandler);
			const report = await hookkit.harness.malformed(
				stripe.event("checkout.session.completed"),
				url,
				{ kind },
			);
			expect(report.pass).toBe(true);
			expect(report.detail).toContain("rejected");
		});
	}

	it("fails a handler that accepts a bad signature", async () => {
		const url = await serve(() => 200); // no verification at all
		const report = await hookkit.harness.malformed(
			stripe.event("checkout.session.completed"),
			url,
			{ kind: "badSignature" },
		);
		expect(report.pass).toBe(false);
		expect(report.detail).toContain("this is a bug");
	});
});
