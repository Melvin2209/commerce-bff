import type { UpstreamPrice, UpstreamProduct, UpstreamStock } from './upstream.js';

/**
 * Pure functions that turn upstream data into exactly what the front-end
 * displays. Keeping them free of I/O makes the business rules easy to test.
 */

const euros = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
export const formatCents = (cents: number) => euros.format(cents / 100);

export interface PriceView {
  currency: 'EUR';
  basePriceCents: number;
  finalPriceCents: number;
  formatted: string;
  formattedBase: string | null;
  promotion: { id: string; label: string; discountCents: number } | null;
}

export function toPriceView(price: UpstreamPrice): PriceView {
  return {
    currency: price.currency,
    basePriceCents: price.basePriceCents,
    finalPriceCents: price.finalPriceCents,
    formatted: formatCents(price.finalPriceCents),
    // Only shown (struck through) when there is a discount.
    formattedBase: price.promotion ? formatCents(price.basePriceCents) : null,
    promotion: price.promotion,
  };
}

export interface AvailabilityView {
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';
  quantity: number | null;
  canAddToCart: boolean;
}

/**
 * When inventory is unavailable we still let users add to cart ("unknown"):
 * blocking sales because of a stock service hiccup costs more than the rare
 * case of selling an item that just went out of stock (checked at checkout).
 */
export function toAvailability(stock: UpstreamStock | undefined): AvailabilityView {
  if (!stock) return { status: 'unknown', quantity: null, canAddToCart: true };
  return {
    status: stock.status,
    quantity: stock.quantity,
    canAddToCart: stock.status !== 'out_of_stock',
  };
}

export interface CartLine {
  sku: string;
  quantity: number;
}

export interface CartLineView {
  sku: string;
  quantity: number;
  name: string | null;
  imageUrl: string | null;
  unitPrice: PriceView | null;
  lineTotalCents: number | null;
  lineTotalFormatted: string | null;
  availability: AvailabilityView;
}

export interface CartTotalsView {
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  formatted: { subtotal: string; discount: string; total: string };
}

export interface CartView {
  cartId: string;
  lines: CartLineView[];
  /** null when prices are unavailable: better no total than a wrong one. */
  totals: CartTotalsView | null;
  warnings: string[];
}

export function buildCartView(
  cartId: string,
  lines: CartLine[],
  products: Map<string, UpstreamProduct> | undefined,
  prices: Map<string, UpstreamPrice> | undefined,
  stock: Map<string, UpstreamStock> | undefined,
): CartView {
  const warnings: string[] = [];

  const lineViews = lines.map((line): CartLineView => {
    const product = products?.get(line.sku);
    const price = prices?.get(line.sku);
    const availability = toAvailability(stock?.get(line.sku));

    if (products && !product) warnings.push(`${line.sku} is no longer sold`);
    if (availability.status === 'out_of_stock') warnings.push(`${line.sku} is out of stock`);
    else if (availability.quantity !== null && line.quantity > availability.quantity) {
      warnings.push(`Only ${availability.quantity} left for ${line.sku}`);
    }

    const lineTotalCents = price ? price.finalPriceCents * line.quantity : null;
    return {
      sku: line.sku,
      quantity: line.quantity,
      name: product?.name ?? null,
      imageUrl: product?.imageUrl ?? null,
      unitPrice: price ? toPriceView(price) : null,
      lineTotalCents,
      lineTotalFormatted: lineTotalCents === null ? null : formatCents(lineTotalCents),
      availability,
    };
  });

  return { cartId, lines: lineViews, totals: computeTotals(lines, prices), warnings };
}

export function computeTotals(
  lines: CartLine[],
  prices: Map<string, UpstreamPrice> | undefined,
): CartTotalsView | null {
  if (!prices) return null;
  // A line without a price (e.g. a removed product) makes the total unreliable.
  if (lines.some((line) => !prices.has(line.sku))) return null;

  let subtotalCents = 0;
  let totalCents = 0;
  let itemCount = 0;
  for (const line of lines) {
    const price = prices.get(line.sku)!;
    subtotalCents += price.basePriceCents * line.quantity;
    totalCents += price.finalPriceCents * line.quantity;
    itemCount += line.quantity;
  }
  const discountCents = subtotalCents - totalCents;

  return {
    itemCount,
    subtotalCents,
    discountCents,
    totalCents,
    formatted: {
      subtotal: formatCents(subtotalCents),
      discount: formatCents(discountCents),
      total: formatCents(totalCents),
    },
  };
}
