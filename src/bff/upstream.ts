/**
 * What the BFF expects from the downstream services. Deliberately declared
 * here rather than imported from the services: in real life they live in
 * other repositories and the BFF only knows their HTTP contract.
 */
export interface UpstreamProduct {
  sku: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  imageUrl: string;
}

export interface UpstreamPrice {
  sku: string;
  currency: 'EUR';
  basePriceCents: number;
  finalPriceCents: number;
  promotion: { id: string; label: string; discountCents: number } | null;
}

export interface UpstreamStock {
  sku: string;
  quantity: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface BatchResponse<T> {
  items: T[];
  missing: string[];
}
