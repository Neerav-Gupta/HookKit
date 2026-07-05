import { describe, expect, it } from "vitest";
import { InMemoryIdempotencyStore } from "./idempotency.js";

describe("InMemoryIdempotencyStore", () => {
	it("returns true the first time a key is seen, false after", async () => {
		const store = new InMemoryIdempotencyStore();
		expect(await store.checkAndSet("evt_1")).toBe(true);
		expect(await store.checkAndSet("evt_1")).toBe(false);
		expect(await store.checkAndSet("evt_1")).toBe(false);
	});

	it("treats different keys independently", async () => {
		const store = new InMemoryIdempotencyStore();
		expect(await store.checkAndSet("evt_1")).toBe(true);
		expect(await store.checkAndSet("evt_2")).toBe(true);
	});

	it("is atomic under concurrent calls with the same key — exactly one true", async () => {
		const store = new InMemoryIdempotencyStore();
		const results = await Promise.all(
			Array.from({ length: 20 }, () => store.checkAndSet("evt_race")),
		);
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it("allows reprocessing after the TTL expires", async () => {
		const store = new InMemoryIdempotencyStore();
		expect(await store.checkAndSet("evt_ttl", 0.01)).toBe(true); // 10ms TTL
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(await store.checkAndSet("evt_ttl", 0.01)).toBe(true);
	});

	it("pruneExpired() removes only expired entries", async () => {
		const store = new InMemoryIdempotencyStore();
		await store.checkAndSet("evt_short", 0.01);
		await store.checkAndSet("evt_long", 100);
		await new Promise((resolve) => setTimeout(resolve, 30));
		store.pruneExpired();
		// evt_short expired and was pruned, so it's treated as new again.
		expect(await store.checkAndSet("evt_short")).toBe(true);
		// evt_long is still tracked, so it's still rejected as a duplicate.
		expect(await store.checkAndSet("evt_long")).toBe(false);
	});
});
