import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresIdempotencyStore } from "./index.js";

const pool = new Pool({
	host: "127.0.0.1",
	port: Number(process.env.HOOKKIT_TEST_POSTGRES_PORT ?? 6543),
	user: "postgres",
	password: "hookkit_test",
	database: "hookkit_test",
	connectionTimeoutMillis: 500,
});
const store = new PostgresIdempotencyStore(pool);

const postgresAvailable = await store
	.ensureSchema()
	.then(() => true)
	.catch(() => false);

afterAll(() => pool.end());

// Needs a real Postgres — no CLAUDE.md offline-first constraint here, this
// package is inherently network-dependent. Skips cleanly if one isn't
// reachable, e.g. `docker run --rm -p 6543:5432 -e POSTGRES_PASSWORD=hookkit_test
// -e POSTGRES_DB=hookkit_test postgres:16-alpine` locally; CI would need a
// postgres service block to exercise this package's tests.
describe.skipIf(!postgresAvailable)(
	"PostgresIdempotencyStore (real Postgres)",
	() => {
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
			await new Promise((resolve) => setTimeout(resolve, 1500));
			expect(await store.checkAndSet(key, 1)).toBe(true);
		});

		it("pruneExpired() removes only expired rows", async () => {
			const shortKey = `hookkit-test:${randomUUID()}`;
			const longKey = `hookkit-test:${randomUUID()}`;
			await store.checkAndSet(shortKey, 1);
			await store.checkAndSet(longKey, 3600);
			await new Promise((resolve) => setTimeout(resolve, 1500));
			await store.pruneExpired();
			expect(await store.checkAndSet(shortKey)).toBe(true); // pruned -> treated as new
			expect(await store.checkAndSet(longKey)).toBe(false); // still tracked
		});
	},
);
