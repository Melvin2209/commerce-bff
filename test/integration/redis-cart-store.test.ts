import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_QUANTITY_PER_LINE } from '../../src/bff/cart/cart-store.js';
import { RedisCartStore } from '../../src/bff/cart/redis-cart-store.js';
import { REDIS_URL } from '../helpers/stack.js';

const redis = new Redis(REDIS_URL, { keyPrefix: `test:${randomUUID()}:` });
const store = new RedisCartStore(redis);

afterAll(() => redis.disconnect());

describe('RedisCartStore', () => {
  it('adds, accumulates and removes lines', async () => {
    const id = randomUUID();
    await store.addItem(id, 'SL-1001', 1);
    await store.addItem(id, 'SL-1001', 2);
    await store.addItem(id, 'SL-1002', 1);
    expect(await store.getLines(id)).toEqual([
      { sku: 'SL-1001', quantity: 3 },
      { sku: 'SL-1002', quantity: 1 },
    ]);
    await store.removeItem(id, 'SL-1001');
    expect(await store.getLines(id)).toEqual([{ sku: 'SL-1002', quantity: 1 }]);
  });

  it('caps the quantity per line', async () => {
    const id = randomUUID();
    await store.addItem(id, 'SL-1001', 8);
    await store.addItem(id, 'SL-1001', 8);
    expect(await store.getLines(id)).toEqual([{ sku: 'SL-1001', quantity: MAX_QUANTITY_PER_LINE }]);
  });

  it('sets an expiry on carts', async () => {
    const id = randomUUID();
    await store.addItem(id, 'SL-1001', 1);
    expect(await redis.ttl(`cart:${id}`)).toBeGreaterThan(0);
  });
});
