/**
 * Idempotency for webhook handlers: providers routinely double-deliver, and
 * "process it, then remember you processed it" is a check-then-set race
 * under real concurrent traffic. checkAndSet() is the single atomic primitive
 * every store must provide, so that race can't be reintroduced by callers.
 */
export interface IdempotencyStore {
	/**
	 * Atomically check-and-mark a key as seen. Returns `true` the FIRST time a
	 * key is seen (caller should process the event), `false` if it has already
	 * been seen and not yet expired (caller should skip/short-circuit).
	 */
	checkAndSet(key: string, ttlSec?: number): Promise<boolean>;
}

const DEFAULT_TTL_SEC = 86400; // 24h — long enough to cover any provider's retry window

interface Entry {
	expiresAt: number;
}

/**
 * In-process Map-based store. Fine for a single instance / tests; does not
 * coordinate across multiple processes or restarts — use
 * @hookkit-dev/idempotency-redis or @hookkit-dev/idempotency-postgres for
 * anything running more than one instance.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
	private readonly seen = new Map<string, Entry>();

	async checkAndSet(
		key: string,
		ttlSec: number = DEFAULT_TTL_SEC,
	): Promise<boolean> {
		const now = Date.now();
		const existing = this.seen.get(key);
		if (existing && existing.expiresAt > now) {
			return false;
		}
		this.seen.set(key, { expiresAt: now + ttlSec * 1000 });
		return true;
	}

	/** Drop expired entries. Not required for correctness — just bounds memory. */
	pruneExpired(): void {
		const now = Date.now();
		for (const [key, entry] of this.seen) {
			if (entry.expiresAt <= now) this.seen.delete(key);
		}
	}
}
