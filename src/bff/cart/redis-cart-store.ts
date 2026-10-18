import type { Redis } from 'ioredis';
import { MAX_QUANTITY_PER_LINE, type CartStore } from './cart-store.js';

const CART_TTL_SECONDS = 7 * 24 * 3600;

/** Carts as Redis hashes: cart:<id> -> { <sku>: <quantity> }, expiring after 7 days idle. */
export class RedisCartStore implements CartStore {
  constructor(private readonly redis: Redis) {}

  private key(cartId: string) {
    return `cart:${cartId}`;
  }

  async getLines(cartId: string) {
    const hash = await this.redis.hgetall(this.key(cartId));
    return Object.entries(hash).map(([sku, quantity]) => ({ sku, quantity: Number(quantity) }));
  }

  async addItem(cartId: string, sku: string, quantity: number) {
    const key = this.key(cartId);
    const total = await this.redis.hincrby(key, sku, quantity);
    // Cap after the increment. Two concurrent adds could briefly exceed the cap,
    // acceptable for a cart (a Lua script would make it atomic).
    if (total > MAX_QUANTITY_PER_LINE) await this.redis.hset(key, sku, MAX_QUANTITY_PER_LINE);
    await this.redis.expire(key, CART_TTL_SECONDS);
  }

  async removeItem(cartId: string, sku: string) {
    await this.redis.hdel(this.key(cartId), sku);
  }
}
