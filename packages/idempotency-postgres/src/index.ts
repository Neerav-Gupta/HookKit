import type { IdempotencyStore } from "@hookkit-dev/core";
import type { Pool } from "pg";

const TABLE = "hookkit_idempotency_keys";

/**
 * Postgres-backed IdempotencyStore. checkAndSet() is a single atomic
 * upsert: insert claims a fresh key; on conflict, the row is only updated
 * (re-claimed) if it has already expired — otherwise the WHERE clause
 * excludes it from the update and no row is returned, meaning "already seen".
 * Postgres's row-level locking on the unique index makes this race-free
 * under concurrent transactions without any additional application locking.
 */
export class PostgresIdempotencyStore implements IdempotencyStore {
	constructor(private readonly pool: Pool) {}

	/** Create the backing table if it doesn't exist yet. Call once at startup. */
	async ensureSchema(): Promise<void> {
		await this.pool.query(`
			CREATE TABLE IF NOT EXISTS ${TABLE} (
				key TEXT PRIMARY KEY,
				expires_at TIMESTAMPTZ NOT NULL
			)
		`);
	}

	async checkAndSet(key: string, ttlSec = 86400): Promise<boolean> {
		const result = await this.pool.query(
			`INSERT INTO ${TABLE} (key, expires_at)
			 VALUES ($1, now() + $2 * interval '1 second')
			 ON CONFLICT (key) DO UPDATE
			   SET expires_at = EXCLUDED.expires_at
			   WHERE ${TABLE}.expires_at <= now()
			 RETURNING key`,
			[key, ttlSec],
		);
		return (result.rowCount ?? 0) > 0;
	}

	/** Delete expired rows. Not required for correctness — bounds table size. Cron it. */
	async pruneExpired(): Promise<number> {
		const result = await this.pool.query(
			`DELETE FROM ${TABLE} WHERE expires_at <= now()`,
		);
		return result.rowCount ?? 0;
	}
}
