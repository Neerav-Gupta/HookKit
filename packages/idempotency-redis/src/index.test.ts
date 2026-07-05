import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { RedisIdempotencyStore } from "./index.js";

const redis = new Redis({
	port: Number(process.env.HOOKKIT_TEST_REDIS_PORT ?? 6399),
	lazyConnect: true,
	retryStrategy: () => null, // don't hang retrying if nothing is listening
});
const store = new RedisIdempotencyStore(redis);

const redisAvailable = await redis
	.connect()
	.then(() => true)
	.catch(() => false);

afterAll(() => (redisAvailable ? redis.quit() : undefined));

// These tests need a real Redis (no CLAUDE.md offline-first constraint here —
// this package is inherently network-dependent). Skips cleanly if one isn't
// reachable, e.g. `docker run --rm -p 6399:6379 redis:7-alpine` locally; CI
// would need a redis service block to exercise this package's tests.
describe.skipIf(!redisAvailable)("RedisIdempotencyStore (real Redis)", () => {
	it("returns true the first time a key is seen, false after", async () => {
		const key = `hookkit-test:${randomUUID()}`;
		expect(await store.checkAndSet(key)).toBe(true);
		expect(await store.checkAndSet(key)).toBe(false);
	});

	it("is atomic under concurrent calls with the same key — exactly one true", async () => {
		const key = `hookkit-test:${randomUUID()}`;
		const results = await Promise.all(
			Array.from({ length: 20 }, () => store.checkAndSet(key)),
		);
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it("allows reprocessing after the TTL expires", async () => {
		const key = `hookkit-test:${randomUUID()}`;
		expect(await store.checkAndSet(key, 1)).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 1200));
		expect(await store.checkAndSet(key, 1)).toBe(true);
	});
});
