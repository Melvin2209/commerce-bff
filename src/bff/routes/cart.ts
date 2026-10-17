import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import type { App } from '../../shared/http-app.js';
import { MAX_QUANTITY_PER_LINE, type CartStore } from '../cart/cart-store.js';
import type { ShopData } from '../data.js';
import { Degradation } from '../degradation.js';
import { CartIdHeader, CartLinesSchema, CartSchema, ErrorSchema, Sku } from '../schemas.js';
import { buildCartView } from '../views.js';

/**
 * Guest carts are identified by a random UUID sent in the x-cart-id header.
 * (A real shop would tie the cart to the user session behind the API gateway.)
 */
export function registerCartRoutes(app: App, data: ShopData, carts: CartStore) {
  async function aggregatedCart(request: FastifyRequest, cartId: string) {
    const lines = await carts.getLines(cartId);
    const skus = lines.map((line) => line.sku);
    const ctx = { requestId: request.id };
    const degradation = new Degradation(request.log);

    // One batch call per service whatever the number of lines, all in parallel.
    const [products, prices, stock] = await Promise.all([
      degradation.optional('catalog', data.products(skus, ctx)),
      degradation.optional('pricing', data.prices(skus, ctx)),
      degradation.optional('inventory', data.stock(skus, ctx)),
    ]);

    return {
      view: {
        ...buildCartView(cartId, lines, products, prices, stock),
        degraded: degradation.services,
      },
      degradation,
    };
  }

  app.get(
    '/cart',
    {
      schema: {
        tags: ['cart'],
        summary: 'Cart with prices, line totals, totals and availability already computed',
        headers: CartIdHeader,
        querystring: Type.Object({
          view: Type.Optional(
            Type.Union([Type.Literal('full'), Type.Literal('lines')], {
              description: '`lines` returns only SKUs and quantities (used by the benchmark).',
            }),
          ),
        }),
        response: { 200: Type.Union([CartSchema, CartLinesSchema]), 400: ErrorSchema },
      },
    },
    async (request, reply) => {
      const cartId = request.headers['x-cart-id'];
      if (!cartId) {
        return reply.code(400).send({ error: 'BadRequest', message: 'Missing x-cart-id header' });
      }
      if (request.query.view === 'lines') {
        return { cartId, lines: await carts.getLines(cartId) };
      }
      const { view, degradation } = await aggregatedCart(request, cartId);
      degradation.applyHeader(reply);
      return view;
    },
  );

  app.post(
    '/cart/items',
    {
      schema: {
        tags: ['cart'],
        summary: 'Add a product to the cart (creates the cart if no x-cart-id is sent)',
        headers: CartIdHeader,
        body: Type.Object({
          sku: Sku,
          quantity: Type.Integer({ minimum: 1, maximum: MAX_QUANTITY_PER_LINE, default: 1 }),
        }),
        response: { 200: CartSchema, 404: ErrorSchema, 503: ErrorSchema },
      },
    },
    async (request, reply) => {
      const cartId = request.headers['x-cart-id'] ?? randomUUID();
      const { sku, quantity } = request.body;

      // Do not let unknown SKUs into carts. If catalog is down this throws -> 503.
      const product = await data.product(sku, { requestId: request.id });
      if (!product) {
        return reply.code(404).send({ error: 'NotFound', message: `Product ${sku} not found` });
      }

      await carts.addItem(cartId, sku, quantity);
      const { view, degradation } = await aggregatedCart(request, cartId);
      degradation.applyHeader(reply);
      reply.header('x-cart-id', cartId);
      return view;
    },
  );

  app.delete(
    '/cart/items/:sku',
    {
      schema: {
        tags: ['cart'],
        summary: 'Remove a product from the cart',
        headers: Type.Object({ 'x-cart-id': Type.String({ format: 'uuid' }) }),
        params: Type.Object({ sku: Sku }),
        response: { 200: CartSchema },
      },
    },
    async (request, reply) => {
      const cartId = request.headers['x-cart-id'];
      await carts.removeItem(cartId, request.params.sku);
      const { view, degradation } = await aggregatedCart(request, cartId);
      degradation.applyHeader(reply);
      return view;
    },
  );
}
