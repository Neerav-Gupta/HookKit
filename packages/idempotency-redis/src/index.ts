import type { IdempotencyStore } from "@hookkit-dev/core";
import type Redis from "ioredis";

/**
 * Redis-backed IdempotencyStore. `SET key 1 NX EX ttl` is atomic in Redis
 * itself, so checkAndSet() needs no additional locking — the single command
 * either claims the key (first time) or fails (already seen).
 */
export class RedisIdempotencyStore implements IdempotencyStore {
	constructor(private readonly redis: Redis) {}

	async checkAndSet(key: string, ttlSec = 86400): Promise<boolean> {
		const result = await this.redis.set(key, "1", "EX", ttlSec, "NX");
		return result === "OK";
	}
}
