import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';

export type CacheKind = 'product' | 'price' | 'stock';

export type CacheTtls = Record<CacheKind, number>;

/**
 * Cache-aside on top of Redis, one key per item: `product:SL-1001`, ...
 *
 * Per-item keys (rather than caching whole responses) mean a cart reuses the
 * prices already fetched for product pages, and invalidating one price only
 * drops one key.
 *
 * TTLs follow how fast each kind of data changes: product info rarely
 * (minutes), prices sometimes, stock constantly (seconds). On top of the TTL,
 * keys are deleted as soon as a service announces a change (see invalidation.ts).
 *
 * The cache is an optimisation, never a dependency: if Redis fails we log
 * and go to the services directly.
 */
export class ItemCache {
  hits = 0;
  misses = 0;

  constructor(
    private readonly redis: Redis,
    private readonly ttls: CacheTtls,
    private readonly log: FastifyBaseLogger,
  ) {}

  static key(kind: CacheKind, sku: string) {
    return `${kind}:${sku}`;
  }

  async getMany<T>(kind: CacheKind, skus: string[]): Promise<Map<string, T>> {
    const found = new Map<string, T>();
    if (skus.length === 0) return found;
    try {
      // MGET: one round-trip whatever the number of keys.
      const values = await this.redis.mget(skus.map((sku) => ItemCache.key(kind, sku)));
      values.forEach((value, i) => {
        if (value !== null) found.set(skus[i]!, JSON.parse(value) as T);
      });
    } catch (error) {
      this.log.warn({ err: (error as Error).message }, 'cache read failed, bypassing cache');
    }
    this.hits += found.size;
    this.misses += skus.length - found.size;
    return found;
  }

  async setMany<T extends { sku: string }>(kind: CacheKind, items: T[]): Promise<void> {
    if (items.length === 0) return;
    try {
      const pipeline = this.redis.pipeline();
      for (const item of items) {
        pipeline.set(ItemCache.key(kind, item.sku), JSON.stringify(item), 'EX', this.ttls[kind]);
      }
      await pipeline.exec();
    } catch (error) {
      this.log.warn({ err: (error as Error).message }, 'cache write failed');
    }
  }

  async invalidate(kind: CacheKind, sku: string): Promise<void> {
    await this.redis.del(ItemCache.key(kind, sku));
  }

  /**
   * Cache-aside for a batch: serve what is cached, fetch only the misses with
   * one upstream call, then store them.
   */
  async through<T extends { sku: string }>(
    kind: CacheKind,
    skus: string[],
    fetchMissing: (missing: string[]) => Promise<Map<string, T>>,
  ): Promise<Map<string, T>> {
    const cached = await this.getMany<T>(kind, skus);
    const missing = skus.filter((sku) => !cached.has(sku));
    if (missing.length === 0) return cached;

    const fetched = await fetchMissing(missing);
    await this.setMany(kind, [...fetched.values()]);
    return new Map([...cached, ...fetched]);
  }
}
