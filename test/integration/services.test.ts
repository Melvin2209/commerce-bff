import { describe, expect, it, vi } from 'vitest';
import { buildCatalogApp } from '../../src/services/catalog/app.js';
import { buildInventoryApp } from '../../src/services/inventory/app.js';
import { buildPricingApp } from '../../src/services/pricing/app.js';

describe('catalog service', () => {
  const app = buildCatalogApp({ logger: false });

  it('returns a product by SKU', async () => {
    const res = await app.inject('/products/SL-1001');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sku: 'SL-1001', brand: 'Pixelcraft' });
  });

  it('returns 404 for an unknown SKU and 400 for a malformed one', async () => {
    expect((await app.inject('/products/SL-9999')).statusCode).toBe(404);
    expect((await app.inject('/products/hello')).statusCode).toBe(400);
  });

  it('supports batch lookups and reports missing SKUs', async () => {
    const res = await app.inject('/products?skus=SL-1001,SL-1002,SL-9999');
    const body = res.json();
    expect(body.items.map((p: { sku: string }) => p.sku)).toEqual(['SL-1001', 'SL-1002']);
    expect(body.missing).toEqual(['SL-9999']);
  });
});

describe('pricing service', () => {
  it('applies the best promotion', async () => {
    const app = buildPricingApp({ logger: false });
    const res = await app.inject('/prices/SL-1002');
    expect(res.json()).toMatchObject({
      basePriceCents: 149_900,
      finalPriceCents: 124_900,
      promotion: { id: 'PROMO-FLASH' },
    });
  });

  it('publishes an event when a price changes', async () => {
    const publish = vi.fn();
    const app = buildPricingApp({ logger: false, publish });
    const res = await app.inject({
      method: 'PUT',
      url: '/prices/SL-1007',
      payload: { basePriceCents: 3_990 },
    });
    expect(res.json().finalPriceCents).toBe(3_990);
    expect(publish).toHaveBeenCalledWith({ type: 'price.updated', sku: 'SL-1007' });
  });
});

describe('inventory service', () => {
  it('derives a stock status from the quantity', async () => {
    const app = buildInventoryApp({ logger: false });
    const res = await app.inject('/stock?skus=SL-1001,SL-1002,SL-1003');
    expect(res.json().items.map((s: { status: string }) => s.status)).toEqual([
      'in_stock',
      'low_stock',
      'out_of_stock',
    ]);
  });

  it('simulates latency', async () => {
    const app = buildInventoryApp({
      logger: false,
      chaos: { latencyMinMs: 50, latencyMaxMs: 50, errorRate: 0 },
    });
    const start = Date.now();
    await app.inject('/stock/SL-1001');
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });
});
