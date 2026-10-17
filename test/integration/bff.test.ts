import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startStack, type Stack } from '../helpers/stack.js';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
});
afterAll(async () => {
  await stack.close();
});
afterEach(async () => {
  // Back to a healthy system, and wait for any open circuit to recover.
  for (const s of ['catalog', 'pricing', 'inventory'] as const) await stack.chaos(s, {});
  await new Promise((r) => setTimeout(r, 350));
});

describe('GET /product-page/:sku', () => {
  it('aggregates catalog, pricing and inventory', async () => {
    const res = await stack.bff.inject('/product-page/SL-1002');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sku: 'SL-1002',
      name: 'Aero 16 Pro Laptop',
      price: {
        finalPriceCents: 124_900,
        formatted: '€1,249.00',
        formattedBase: '€1,499.00',
        promotion: { id: 'PROMO-FLASH' },
      },
      availability: { status: 'low_stock', quantity: 3, canAddToCart: true },
      degraded: [],
    });
    expect(res.headers['x-degraded']).toBeUndefined();
  });

  it('propagates the request id', async () => {
    const res = await stack.bff.inject({
      url: '/product-page/SL-1001',
      headers: { 'x-request-id': 'trace-123' },
    });
    expect(res.headers['x-request-id']).toBe('trace-123');
  });

  it('returns 404 for an unknown product', async () => {
    expect((await stack.bff.inject('/product-page/SL-9999')).statusCode).toBe(404);
  });

  it('degrades gracefully when inventory is down', async () => {
    await stack.chaos('inventory', { errorRate: 1 });
    const res = await stack.bff.inject('/product-page/SL-1001');
    expect(res.statusCode).toBe(200);
    expect(res.json().availability).toEqual({
      status: 'unknown',
      quantity: null,
      canAddToCart: true,
    });
    expect(res.json().degraded).toEqual(['inventory']);
    expect(res.headers['x-degraded']).toBe('inventory');
  });

  it('degrades when pricing is too slow (timeout)', async () => {
    await stack.chaos('pricing', { latencyMinMs: 400, latencyMaxMs: 400 });
    const start = Date.now();
    const res = await stack.bff.inject('/product-page/SL-1001');
    expect(res.json().price).toBeNull();
    expect(res.json().degraded).toEqual(['pricing']);
    // 2 attempts x 150ms timeout + backoff: far below the 400ms of the slow service x2
    expect(Date.now() - start).toBeLessThan(450);
  });

  it('answers 503 when the catalog is down (no page without product data)', async () => {
    await stack.chaos('catalog', { errorRate: 1 });
    const res = await stack.bff.inject('/product-page/SL-1001');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'ServiceUnavailable', message: 'catalog is unavailable' });
  });

  it('opens the circuit after repeated failures, then recovers', async () => {
    await stack.chaos('inventory', { errorRate: 1 });
    for (let i = 0; i < 3; i++) await stack.bff.inject('/product-page/SL-1001');
    let health = (await stack.bff.inject('/health/upstreams')).json();
    expect(health.circuits.inventory).toBe('OPEN');

    await stack.chaos('inventory', {});
    await new Promise((r) => setTimeout(r, 350)); // reset timeout
    const res = await stack.bff.inject('/product-page/SL-1001');
    expect(res.json().degraded).toEqual([]);
    health = (await stack.bff.inject('/health/upstreams')).json();
    expect(health.circuits.inventory).toBe('CLOSED');
  });

  it('reuses the same OAuth2 token across requests', async () => {
    const before = stack.auth.stats.tokenRequests;
    await Promise.all(Array.from({ length: 20 }, () => stack.bff.inject('/product-page/SL-1005')));
    expect(stack.auth.stats.tokenRequests - before).toBe(0);
  });
});

describe('cart', () => {
  async function addItem(sku: string, quantity: number, cartId?: string) {
    return stack.bff.inject({
      method: 'POST',
      url: '/cart/items',
      headers: cartId ? { 'x-cart-id': cartId } : {},
      payload: { sku, quantity },
    });
  }

  it('creates a cart and computes line totals and totals', async () => {
    const first = await addItem('SL-1001', 2); // 899.00 -15% = 764.15
    const cartId = first.headers['x-cart-id'] as string;
    expect(cartId).toMatch(/^[0-9a-f-]{36}$/);

    const res = await addItem('SL-1007', 1, cartId); // 49.90, no promo
    const cart = res.json();
    expect(cart.lines).toHaveLength(2);
    expect(cart.lines[0]).toMatchObject({ sku: 'SL-1001', quantity: 2, lineTotalCents: 152_830 });
    expect(cart.totals).toEqual({
      itemCount: 3,
      subtotalCents: 2 * 89_900 + 4_990,
      discountCents: 2 * 13_485,
      totalCents: 152_830 + 4_990,
      formatted: { subtotal: '€1,847.90', discount: '€269.70', total: '€1,578.20' },
    });
  });

  it('warns about out of stock items', async () => {
    const res = await addItem('SL-1003', 1);
    expect(res.json().warnings).toEqual(['SL-1003 is out of stock']);
  });

  it('returns raw lines with ?view=lines', async () => {
    const cartId = (await addItem('SL-1005', 3)).headers['x-cart-id'] as string;
    const res = await stack.bff.inject({
      url: '/cart?view=lines',
      headers: { 'x-cart-id': cartId },
    });
    expect(res.json()).toEqual({ cartId, lines: [{ sku: 'SL-1005', quantity: 3 }] });
  });

  it('removes items', async () => {
    const cartId = (await addItem('SL-1005', 1)).headers['x-cart-id'] as string;
    const res = await stack.bff.inject({
      method: 'DELETE',
      url: '/cart/items/SL-1005',
      headers: { 'x-cart-id': cartId },
    });
    expect(res.json().lines).toEqual([]);
  });

  it('rejects unknown products and missing cart ids', async () => {
    expect((await addItem('SL-9999', 1)).statusCode).toBe(404);
    expect((await stack.bff.inject('/cart')).statusCode).toBe(400);
  });

  it('hides totals rather than showing wrong ones when pricing is down', async () => {
    const cartId = (await addItem('SL-1001', 1)).headers['x-cart-id'] as string;
    await stack.chaos('pricing', { errorRate: 1 });
    const res = await stack.bff.inject({ url: '/cart', headers: { 'x-cart-id': cartId } });
    expect(res.statusCode).toBe(200);
    expect(res.json().totals).toBeNull();
    expect(res.json().lines[0].unitPrice).toBeNull();
    expect(res.json().degraded).toEqual(['pricing']);
  });
});

describe('OpenAPI', () => {
  it('serves the OpenAPI document', async () => {
    const res = await stack.bff.inject('/docs/json');
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().paths)).toEqual(
      expect.arrayContaining(['/product-page/{sku}', '/cart', '/cart/items']),
    );
  });
});
