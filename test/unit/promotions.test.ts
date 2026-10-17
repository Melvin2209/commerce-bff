import { describe, expect, it } from 'vitest';
import { computePrice } from '../../src/services/pricing/promotions.js';
import type { Promotion } from '../../src/services/seed.js';

const promo = (overrides: Partial<Promotion>): Promotion => ({
  id: 'P',
  label: 'Promo',
  skus: ['SL-0001'],
  type: 'percent',
  value: 10,
  endsAt: '2099-01-01T00:00:00.000Z',
  ...overrides,
});

describe('computePrice', () => {
  const entry = { sku: 'SL-0001', basePriceCents: 10_000 };

  it('returns the base price when no promotion applies', () => {
    const price = computePrice(entry, [promo({ skus: ['SL-9999'] })]);
    expect(price.finalPriceCents).toBe(10_000);
    expect(price.promotion).toBeNull();
  });

  it('applies a percent discount', () => {
    expect(computePrice(entry, [promo({ value: 15 })]).finalPriceCents).toBe(8_500);
  });

  it('keeps only the best promotion when several apply', () => {
    const price = computePrice(entry, [
      promo({ id: 'A', value: 10 }), // -1000
      promo({ id: 'B', type: 'fixed', value: 2_500 }), // -2500
    ]);
    expect(price.promotion?.id).toBe('B');
    expect(price.finalPriceCents).toBe(7_500);
  });

  it('ignores expired promotions', () => {
    const now = new Date('2030-01-01');
    const price = computePrice(entry, [promo({ endsAt: '2029-12-31T00:00:00.000Z' })], now);
    expect(price.promotion).toBeNull();
  });

  it('never returns a negative price', () => {
    const price = computePrice(entry, [promo({ type: 'fixed', value: 50_000 })]);
    expect(price.finalPriceCents).toBe(0);
  });
});
