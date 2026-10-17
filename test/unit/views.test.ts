import { describe, expect, it } from 'vitest';
import type { UpstreamPrice } from '../../src/bff/upstream.js';
import { buildCartView, computeTotals, formatCents, toAvailability } from '../../src/bff/views.js';

const price = (sku: string, base: number, final = base): UpstreamPrice => ({
  sku,
  currency: 'EUR',
  basePriceCents: base,
  finalPriceCents: final,
  promotion: final < base ? { id: 'P', label: 'Promo', discountCents: base - final } : null,
});

describe('formatCents', () => {
  it('formats integer cents as euros', () => {
    expect(formatCents(124_900)).toBe('€1,249.00');
    expect(formatCents(5)).toBe('€0.05');
  });
});

describe('toAvailability', () => {
  it('maps the stock status', () => {
    expect(toAvailability({ sku: 'A', quantity: 0, status: 'out_of_stock' }).canAddToCart).toBe(
      false,
    );
  });

  it('returns "unknown" but still allows adding to cart when stock is unavailable', () => {
    expect(toAvailability(undefined)).toEqual({
      status: 'unknown',
      quantity: null,
      canAddToCart: true,
    });
  });
});

describe('computeTotals', () => {
  const lines = [
    { sku: 'A', quantity: 2 },
    { sku: 'B', quantity: 1 },
  ];

  it('sums base prices, discounts and final prices', () => {
    const prices = new Map([
      ['A', price('A', 1_000, 800)],
      ['B', price('B', 500)],
    ]);
    expect(computeTotals(lines, prices)).toMatchObject({
      itemCount: 3,
      subtotalCents: 2_500,
      discountCents: 400,
      totalCents: 2_100,
    });
  });

  it('returns null when prices are unavailable or incomplete', () => {
    expect(computeTotals(lines, undefined)).toBeNull();
    expect(computeTotals(lines, new Map([['A', price('A', 1_000)]]))).toBeNull();
  });
});

describe('buildCartView', () => {
  it('warns when the requested quantity exceeds the stock', () => {
    const view = buildCartView(
      'cart-1',
      [{ sku: 'A', quantity: 4 }],
      undefined,
      new Map([['A', price('A', 1_000)]]),
      new Map([['A', { sku: 'A', quantity: 2, status: 'low_stock' as const }]]),
    );
    expect(view.warnings).toEqual(['Only 2 left for A']);
    expect(view.lines[0]?.lineTotalCents).toBe(4_000);
  });
});
