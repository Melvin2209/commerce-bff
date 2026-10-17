/**
 * Events published by the services when their data changes. The BFF listens
 * to them (Redis pub/sub) to invalidate its cache right away instead of
 * waiting for the TTL to expire.
 */
export const CHANGE_CHANNEL = 'shoplab:changes';

export interface ChangeEvent {
  type: 'product.updated' | 'price.updated' | 'stock.updated';
  sku: string;
}

export type ChangePublisher = (event: ChangeEvent) => void | Promise<void>;
