import type { CartLine } from '../views.js';

export const MAX_QUANTITY_PER_LINE = 10;

/** Where carts are persisted. Redis in production, in-memory for unit tests. */
export interface CartStore {
  getLines(cartId: string): Promise<CartLine[]>;
  /** Adds to the existing quantity, capped at MAX_QUANTITY_PER_LINE. */
  addItem(cartId: string, sku: string, quantity: number): Promise<void>;
  removeItem(cartId: string, sku: string): Promise<void>;
}

export class InMemoryCartStore implements CartStore {
  private readonly carts = new Map<string, Map<string, number>>();

  async getLines(cartId: string) {
    const cart = this.carts.get(cartId) ?? new Map<string, number>();
    return [...cart].map(([sku, quantity]) => ({ sku, quantity }));
  }

  async addItem(cartId: string, sku: string, quantity: number) {
    const cart = this.carts.get(cartId) ?? new Map<string, number>();
    cart.set(sku, Math.min(MAX_QUANTITY_PER_LINE, (cart.get(sku) ?? 0) + quantity));
    this.carts.set(cartId, cart);
  }

  async removeItem(cartId: string, sku: string) {
    this.carts.get(cartId)?.delete(sku);
  }
}
