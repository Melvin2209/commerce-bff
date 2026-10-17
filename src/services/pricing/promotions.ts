import type { PriceEntry, Promotion } from '../seed.js';

export interface ComputedPrice {
  sku: string;
  currency: 'EUR';
  basePriceCents: number;
  finalPriceCents: number;
  promotion: { id: string; label: string; discountCents: number } | null;
}

function discountFor(promotion: Promotion, basePriceCents: number): number {
  const raw =
    promotion.type === 'percent'
      ? Math.round((basePriceCents * promotion.value) / 100)
      : promotion.value;
  // A discount can never make the price negative.
  return Math.min(raw, basePriceCents);
}

/**
 * Applies the single best active promotion to a price. Promotions are not
 * stackable: when several apply, the customer gets the biggest discount.
 */
export function computePrice(
  entry: PriceEntry,
  promotions: Promotion[],
  now: Date = new Date(),
): ComputedPrice {
  let best: ComputedPrice['promotion'] = null;

  for (const promotion of promotions) {
    if (!promotion.skus.includes(entry.sku)) continue;
    if (new Date(promotion.endsAt) <= now) continue;

    const discountCents = discountFor(promotion, entry.basePriceCents);
    if (!best || discountCents > best.discountCents) {
      best = { id: promotion.id, label: promotion.label, discountCents };
    }
  }

  return {
    sku: entry.sku,
    currency: 'EUR',
    basePriceCents: entry.basePriceCents,
    finalPriceCents: entry.basePriceCents - (best?.discountCents ?? 0),
    promotion: best,
  };
}
