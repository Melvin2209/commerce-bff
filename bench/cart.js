// k6 benchmark: how should the front-end display a cart?
//
//   MODE=per-line   -> GET /cart?view=lines, then one GET /products/:sku/price per line
//                      (in parallel, like Promise.all in a browser), totals computed client-side
//   MODE=aggregated -> one GET /cart: line totals and totals already computed by the BFF
//
// Usage: k6 run -e MODE=aggregated -e LINES=10 bench/cart.js
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const MODE = __ENV.MODE || 'aggregated';
const LINES = Number(__ENV.LINES || 10);

// Time to get everything needed to render the cart (all requests of one "page view").
const cartRender = new Trend('cart_render_ms', true);
const cartRenders = new Counter('cart_renders');

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '20s',
  // Browsers open at most 6 HTTP/1.1 connections per host; k6 uses the same default.
  batchPerHost: 6,
  thresholds: { checks: ['rate>0.99'] },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)'],
};

const SKUS = Array.from({ length: 20 }, (_, i) => `SL-${1001 + i}`);

export function setup() {
  // Create the cart once; every virtual user then reads it.
  let cartId;
  for (const sku of SKUS.slice(0, LINES)) {
    const res = http.post(`${BASE_URL}/cart/items`, JSON.stringify({ sku, quantity: 1 }), {
      headers: { 'content-type': 'application/json', ...(cartId && { 'x-cart-id': cartId }) },
    });
    cartId = res.headers['X-Cart-Id'];
  }
  return { cartId };
}

function perLine(cartId) {
  const start = Date.now();
  const linesRes = http.get(`${BASE_URL}/cart?view=lines`, { headers: { 'x-cart-id': cartId } });
  const lines = linesRes.json('lines');
  const prices = http.batch(lines.map((l) => ['GET', `${BASE_URL}/products/${l.sku}/price`]));
  // What the front would then have to do itself:
  const total = lines.reduce(
    (sum, l, i) => sum + prices[i].json('finalPriceCents') * l.quantity,
    0,
  );
  cartRender.add(Date.now() - start);
  check(prices, { 'all prices OK': (r) => r.every((p) => p.status === 200) && total > 0 });
}

function aggregated(cartId) {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/cart`, { headers: { 'x-cart-id': cartId } });
  cartRender.add(Date.now() - start);
  check(res, { 'cart OK': (r) => r.status === 200 && r.json('totals.totalCents') > 0 });
}

export default function (data) {
  if (MODE === 'per-line') perLine(data.cartId);
  else aggregated(data.cartId);
  cartRenders.add(1);
}

export function handleSummary(data) {
  const out = __ENV.OUT || `bench/results/${MODE}-${LINES}.json`;
  return { [out]: JSON.stringify(data, null, 2) };
}
