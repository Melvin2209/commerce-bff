/**
 * Fake data for the fictional "ShopLab" store. Everything here is invented:
 * brands, products, prices and promotions. Amounts are integers in cents to
 * avoid floating point rounding issues (0.1 + 0.2 !== 0.3).
 */

export interface Product {
  sku: string;
  name: string;
  brand: string;
  category: 'laptops' | 'audio' | 'phones' | 'gaming' | 'home';
  description: string;
  imageUrl: string;
}

export interface PriceEntry {
  sku: string;
  basePriceCents: number;
}

export interface Promotion {
  id: string;
  label: string;
  skus: string[];
  type: 'percent' | 'fixed';
  /** Percent (e.g. 15 for -15%) or amount in cents for "fixed". */
  value: number;
  endsAt: string;
}

export interface StockEntry {
  sku: string;
  quantity: number;
}

const rows: Array<[string, string, Product['category'], number, number]> = [
  // [name, brand, category, price in cents, stock]
  ['Aero 14 Laptop', 'Pixelcraft', 'laptops', 89_900, 12],
  ['Aero 16 Pro Laptop', 'Pixelcraft', 'laptops', 149_900, 3],
  ['Studio Book 13', 'Nordwave', 'laptops', 109_900, 0],
  ['Chromalite 11', 'Kinetica', 'laptops', 34_900, 40],
  ['Pulse ANC Headphones', 'Auralis', 'audio', 24_900, 25],
  ['Pulse Buds', 'Auralis', 'audio', 12_900, 60],
  ['Boom Mini Speaker', 'Voltek', 'audio', 4_990, 100],
  ['Soundbar 300', 'Nordwave', 'audio', 29_900, 4],
  ['Orbit X Smartphone', 'Kinetica', 'phones', 79_900, 18],
  ['Orbit Lite Smartphone', 'Kinetica', 'phones', 39_900, 2],
  ['Nova 5G Smartphone', 'Voltek', 'phones', 54_900, 30],
  ['Fast Charger 65W', 'Voltek', 'phones', 3_490, 250],
  ['Gamepad Pro', 'Pixelcraft', 'gaming', 6_990, 45],
  ['Arcade Keyboard', 'Pixelcraft', 'gaming', 11_990, 0],
  ['Glide Gaming Mouse', 'Auralis', 'gaming', 5_990, 80],
  ['27" QHD Monitor', 'Nordwave', 'gaming', 32_900, 7],
  ['Robo Vacuum S2', 'Voltek', 'home', 39_900, 9],
  ['Smart Bulb (4 pack)', 'Kinetica', 'home', 4_990, 120],
  ['Air Purifier 500', 'Nordwave', 'home', 22_900, 1],
  ['Espresso One', 'Voltek', 'home', 18_900, 14],
];

export const products: Product[] = rows.map(([name, brand, category], i) => {
  const sku = `SL-${1001 + i}`;
  return {
    sku,
    name,
    brand,
    category,
    description: `${brand} ${name} — a fictional product from the ShopLab demo catalog.`,
    imageUrl: `https://picsum.photos/seed/${sku}/600/400`,
  };
});

export const prices: PriceEntry[] = rows.map(([, , , basePriceCents], i) => ({
  sku: `SL-${1001 + i}`,
  basePriceCents,
}));

export const stock: StockEntry[] = rows.map(([, , , , quantity], i) => ({
  sku: `SL-${1001 + i}`,
  quantity,
}));

export const promotions: Promotion[] = [
  {
    id: 'PROMO-SCHOOL',
    label: 'Back to school: -15% on laptops',
    skus: ['SL-1001', 'SL-1002', 'SL-1003', 'SL-1004'],
    type: 'percent',
    value: 15,
    endsAt: '2099-01-01T00:00:00.000Z',
  },
  {
    id: 'PROMO-AUDIO',
    label: '€30 off selected audio',
    skus: ['SL-1005', 'SL-1008'],
    type: 'fixed',
    value: 3_000,
    endsAt: '2099-01-01T00:00:00.000Z',
  },
  {
    // Overlaps PROMO-SCHOOL on SL-1002: the pricing service keeps the best deal.
    id: 'PROMO-FLASH',
    label: 'Flash sale: €250 off',
    skus: ['SL-1002'],
    type: 'fixed',
    value: 25_000,
    endsAt: '2099-01-01T00:00:00.000Z',
  },
];
