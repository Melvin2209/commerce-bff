import type { ItemCache } from './cache/cache.js';
import type { CallContext, ServiceClient } from './clients/service-client.js';
import type { BatchResponse, UpstreamPrice, UpstreamProduct, UpstreamStock } from './upstream.js';

export interface Clients {
  catalog: ServiceClient;
  pricing: ServiceClient;
  inventory: ServiceClient;
}

const toMap = <T extends { sku: string }>(items: T[] | undefined) =>
  new Map((items ?? []).map((item) => [item.sku, item]));

const query = (skus: string[]) => `skus=${skus.map(encodeURIComponent).join(',')}`;

/**
 * Data access layer of the BFF: one method per kind of data.
 * - Uses the batch endpoints so a cart of 20 lines costs 1 call per service, not 20.
 * - Goes through the Redis cache when one is configured: only the cache misses
 *   are requested from the services.
 * Errors (UpstreamError) are left to the caller, who decides how to degrade.
 */
export class ShopData {
  constructor(
    private readonly clients: Clients,
    private readonly cache?: ItemCache,
  ) {}

  async product(sku: string, ctx: CallContext): Promise<UpstreamProduct | null> {
    const fetchOne = async () => {
      const product = await this.clients.catalog.get<UpstreamProduct>(
        `/products/${encodeURIComponent(sku)}`,
        ctx,
      );
      return toMap(product ? [product] : []);
    };
    const found = this.cache
      ? await this.cache.through('product', [sku], fetchOne)
      : await fetchOne();
    return found.get(sku) ?? null;
  }

  async products(skus: string[], ctx: CallContext) {
    return this.batch<UpstreamProduct>('product', skus, async (missing) => {
      const res = await this.clients.catalog.get<BatchResponse<UpstreamProduct>>(
        `/products?${query(missing)}`,
        ctx,
      );
      return toMap(res?.items);
    });
  }

  async prices(skus: string[], ctx: CallContext) {
    return this.batch<UpstreamPrice>('price', skus, async (missing) => {
      const res = await this.clients.pricing.get<BatchResponse<UpstreamPrice>>(
        `/prices?${query(missing)}`,
        ctx,
      );
      return toMap(res?.items);
    });
  }

  async stock(skus: string[], ctx: CallContext) {
    return this.batch<UpstreamStock>('stock', skus, async (missing) => {
      const res = await this.clients.inventory.get<BatchResponse<UpstreamStock>>(
        `/stock?${query(missing)}`,
        ctx,
      );
      return toMap(res?.items);
    });
  }

  private async batch<T extends { sku: string }>(
    kind: 'product' | 'price' | 'stock',
    skus: string[],
    fetchMissing: (missing: string[]) => Promise<Map<string, T>>,
  ): Promise<Map<string, T>> {
    if (skus.length === 0) return new Map();
    return this.cache ? this.cache.through(kind, skus, fetchMissing) : fetchMissing(skus);
  }
}
