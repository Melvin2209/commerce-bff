import type { CallContext, ServiceClient } from './clients/service-client.js';
import type { BatchResponse, UpstreamPrice, UpstreamProduct, UpstreamStock } from './upstream.js';

export interface Clients {
  catalog: ServiceClient;
  pricing: ServiceClient;
  inventory: ServiceClient;
}

const toMap = <T extends { sku: string }>(items: T[] | undefined) =>
  new Map((items ?? []).map((item) => [item.sku, item]));

/**
 * Data access layer of the BFF: one method per kind of data, using the batch
 * endpoints so a cart of 20 lines costs 1 call per service, not 20.
 * Errors (UpstreamError) are left to the caller, who decides how to degrade.
 */
export class ShopData {
  constructor(private readonly clients: Clients) {}

  async product(sku: string, ctx: CallContext) {
    return this.clients.catalog.get<UpstreamProduct>(`/products/${encodeURIComponent(sku)}`, ctx);
  }

  async products(skus: string[], ctx: CallContext) {
    if (skus.length === 0) return new Map<string, UpstreamProduct>();
    const res = await this.clients.catalog.get<BatchResponse<UpstreamProduct>>(
      `/products?skus=${skus.map(encodeURIComponent).join(',')}`,
      ctx,
    );
    return toMap(res?.items);
  }

  async prices(skus: string[], ctx: CallContext) {
    if (skus.length === 0) return new Map<string, UpstreamPrice>();
    const res = await this.clients.pricing.get<BatchResponse<UpstreamPrice>>(
      `/prices?skus=${skus.map(encodeURIComponent).join(',')}`,
      ctx,
    );
    return toMap(res?.items);
  }

  async stock(skus: string[], ctx: CallContext) {
    if (skus.length === 0) return new Map<string, UpstreamStock>();
    const res = await this.clients.inventory.get<BatchResponse<UpstreamStock>>(
      `/stock?skus=${skus.map(encodeURIComponent).join(',')}`,
      ctx,
    );
    return toMap(res?.items);
  }
}
