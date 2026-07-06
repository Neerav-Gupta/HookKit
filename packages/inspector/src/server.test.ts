import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { generate, registry } from "@hookkit-dev/core";
import {
	fixturePackageRoot,
	getFixture,
	loadManifest,
} from "@hookkit-dev/fixtures";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { InspectorDb } from "./db.js";
import { createInspectorApp, guessProvider } from "./server.js";

const secret = "whsec_inspector_test";
const { app, db, events } = createInspectorApp({
	db: new InspectorDb(":memory:"),
	secrets: { stripe: secret },
});

// Loopback receiver for replay tests.
const replayed: Buffer[] = [];
const receiver = createServer((req, res) => {
	const chunks: Buffer[] = [];
	req.on("data", (chunk) => chunks.push(chunk));
	req.on("end", () => {
		replayed.push(Buffer.concat(chunks));
		res.statusCode = 200;
		res.end("ok");
	});
});
await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
const addr = receiver.address();
const receiverUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;

afterAll(() => {
	db.close();
	return new Promise<void>((resolve) => receiver.close(() => resolve()));
});

async function createEndpoint(): Promise<{ id: string; slug: string }> {
	const res = await app.request("/api/endpoints", {
		method: "POST",
		body: JSON.stringify({ name: "test" }),
	});
	expect(res.status).toBe(201);
	return (await res.json()) as { id: string; slug: string };
}

describe("inspector capture", () => {
	it("captures the exact bytes and verifies the signature live", async () => {
		const endpoint = await createEndpoint();
		const evt = generate("stripe", "checkout.session.completed", { secret });

		const captureEvents: unknown[] = [];
		events.on("capture", (e) => captureEvents.push(e));

		const res = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(evt.rawBody),
		});
		expect(res.status).toBe(200);
		const { id } = (await res.json()) as { id: string };

		const row = db.requestById(id);
		expect(row?.body_blob.equals(evt.rawBody)).toBe(true); // raw-body fidelity
		expect(row?.provider_guess).toBe("stripe");
		expect(row?.signature_status).toBe("valid");
		expect(captureEvents).toHaveLength(1); // SSE broadcast fired
	});

	it("flags a tampered capture as invalid", async () => {
		const endpoint = await createEndpoint();
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const res = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(Buffer.concat([evt.rawBody, Buffer.from(" ")])),
		});
		const { id } = (await res.json()) as { id: string };
		expect(db.requestById(id)?.signature_status).toBe("invalid");
	});

	it("404s on unknown endpoints", async () => {
		const res = await app.request("/in/nope", { method: "POST", body: "{}" });
		expect(res.status).toBe(404);
	});

	it("guesses providers from signature headers", () => {
		expect(guessProvider({ "Stripe-Signature": "t=1,v1=x" })).toBe("stripe");
		expect(guessProvider({ "x-hub-signature-256": "sha256=x" })).toBe("github");
		expect(guessProvider({ "x-plain": "1" })).toBe("");
	});
});

describe("inspector schema-drift detection", () => {
	it("reports schema: OK for a well-formed captured payload", async () => {
		const endpoint = await createEndpoint();
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const captureRes = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(evt.rawBody),
		});
		const { id } = (await captureRes.json()) as { id: string };

		const detailRes = await app.request(`/api/requests/${id}`);
		const detail = (await detailRes.json()) as {
			schema_drift?: { checked: boolean; matched: boolean; eventType: string };
		};
		expect(detail.schema_drift).toEqual({
			checked: true,
			matched: true,
			eventType: "checkout.session.completed",
		});
	});

	it("flags drift when the captured payload doesn't match the known schema", async () => {
		const endpoint = await createEndpoint();
		// A fixture's shape can't be produced via generate()'s deep-merge
		// overrides (they can't delete required keys), so build a deliberately
		// malformed body directly and sign it for real with the adapter.
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
		const headers = {
			"Content-Type": "application/json",
			...registry.get("stripe").sign({ rawBody: malformed, secret }),
		};

		const captureRes = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers,
			body: new Uint8Array(malformed),
		});
		const { id } = (await captureRes.json()) as { id: string };

		const detailRes = await app.request(`/api/requests/${id}`);
		const detail = (await detailRes.json()) as {
			schema_drift?: { checked: boolean; matched: boolean; errors: string[] };
		};
		expect(detail.schema_drift?.checked).toBe(true);
		expect(detail.schema_drift?.matched).toBe(false);
		expect(detail.schema_drift?.errors?.length).toBeGreaterThan(0);
	});

	it("reports no schema_drift for a request with an unknown provider", async () => {
		const endpoint = await createEndpoint();
		const captureRes = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		const { id } = (await captureRes.json()) as { id: string };
		const detailRes = await app.request(`/api/requests/${id}`);
		const detail = (await detailRes.json()) as { schema_drift?: unknown };
		expect(detail.schema_drift).toBeUndefined();
	});
});

describe("inspector: capture → fixture loop", () => {
	// save-fixture writes into the real @hookkit-dev/fixtures package (that's
	// its whole job) — use an obviously-fake provider name and always restore
	// manifest.json, even if an assertion throws.
	const TEST_PROVIDER = "__vitest_inspector_savefixture_test__";
	const root = fixturePackageRoot();
	const manifestPath = join(root, "manifest.json");
	const originalManifest = readFileSync(manifestPath, "utf8");

	afterEach(() => {
		writeFileSync(manifestPath, originalManifest);
		rmSync(join(root, "fixtures", TEST_PROVIDER), {
			recursive: true,
			force: true,
		});
	});

	it("saves a captured request's exact bytes as a fixture", async () => {
		const endpoint = await createEndpoint();
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const captureRes = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(evt.rawBody),
		});
		const { id } = (await captureRes.json()) as { id: string };

		const saveRes = await app.request(`/api/requests/${id}/save-fixture`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: TEST_PROVIDER,
				eventType: "captured.event",
			}),
		});
		expect(saveRes.status).toBe(201);
		const saved = (await saveRes.json()) as {
			fixtureId: string;
			apiVersion: string;
			readyToUse: boolean;
		};
		expect(saved.fixtureId).toBe(`${TEST_PROVIDER}/captured.event`);
		expect(saved.readyToUse).toBe(false); // TEST_PROVIDER isn't a registered adapter

		const fixture = getFixture(saved.fixtureId, saved.apiVersion);
		expect(fixture.rawBody.equals(evt.rawBody)).toBe(true); // exact captured bytes
		expect(loadManifest()[saved.fixtureId]?.[saved.apiVersion]).toBeDefined();
	});

	it("reports readyToUse:true for a new API-version variant of an already-known event", async () => {
		const endpoint = await createEndpoint();
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const captureRes = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(evt.rawBody),
		});
		const { id } = (await captureRes.json()) as { id: string };

		const saveRes = await app.request(`/api/requests/${id}/save-fixture`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: "stripe",
				eventType: "checkout.session.completed",
				apiVersion: "__vitest_test_variant__",
			}),
		});
		expect(saveRes.status).toBe(201);
		const saved = (await saveRes.json()) as { readyToUse: boolean };
		expect(saved.readyToUse).toBe(true); // "checkout.session.completed" is a real stripe event

		// Clean up: this one writes into the real stripe fixture dir.
		rmSync(join(root, "fixtures", "stripe", "__vitest_test_variant__"), {
			recursive: true,
			force: true,
		});
	});

	it("409s when the fixture is already registered", async () => {
		const endpoint = await createEndpoint();
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const captureRes = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(evt.rawBody),
		});
		const { id } = (await captureRes.json()) as { id: string };
		const body = JSON.stringify({
			provider: TEST_PROVIDER,
			eventType: "captured.event",
		});
		const first = await app.request(`/api/requests/${id}/save-fixture`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
		});
		expect(first.status).toBe(201);
		const second = await app.request(`/api/requests/${id}/save-fixture`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
		});
		expect(second.status).toBe(409);
	});

	it("400s when provider or eventType is missing", async () => {
		const endpoint = await createEndpoint();
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const captureRes = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(evt.rawBody),
		});
		const { id } = (await captureRes.json()) as { id: string };
		const res = await app.request(`/api/requests/${id}/save-fixture`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ provider: TEST_PROVIDER }),
		});
		expect(res.status).toBe(400);
	});
});

describe("inspector replay", () => {
	it("replays the exact captured bytes to a target", async () => {
		const endpoint = await createEndpoint();
		const evt = generate("stripe", "checkout.session.completed", { secret });
		const captureRes = await app.request(`/in/${endpoint.slug}`, {
			method: "POST",
			headers: evt.headers,
			body: new Uint8Array(evt.rawBody),
		});
		const { id } = (await captureRes.json()) as { id: string };

		replayed.length = 0;
		const replayRes = await app.request(`/api/requests/${id}/replay`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ targetUrl: receiverUrl }),
		});
		expect(replayRes.status).toBe(200);
		const replay = (await replayRes.json()) as { status: number };
		expect(replay.status).toBe(200);
		expect(replayed[0]?.equals(evt.rawBody)).toBe(true);
		expect(db.listReplays(id)).toHaveLength(1);
	});
});

describe("inspector security", () => {
	it("refuses non-loopback binds without basic auth", () => {
		expect(() =>
			createInspectorApp({ db: new InspectorDb(":memory:"), host: "0.0.0.0" }),
		).toThrow(/basic auth/);
	});

	it("enforces basic auth on non-loopback binds", async () => {
		const guarded = createInspectorApp({
			db: new InspectorDb(":memory:"),
			host: "0.0.0.0",
			auth: "user:pass",
		});
		const denied = await guarded.app.request("/api/endpoints");
		expect(denied.status).toBe(401);
		const allowed = await guarded.app.request("/api/endpoints", {
			headers: {
				Authorization: `Basic ${Buffer.from("user:pass").toString("base64")}`,
			},
		});
		expect(allowed.status).toBe(200);
	});
});
