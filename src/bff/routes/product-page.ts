import { Type } from 'typebox';
import type { App } from '../../shared/http-app.js';
import type { ShopData } from '../data.js';
import { Degradation } from '../degradation.js';
import { ErrorSchema, PriceViewSchema, ProductPageSchema, Sku } from '../schemas.js';
import { toAvailability, toPriceView } from '../views.js';

export function registerProductRoutes(app: App, data: ShopData) {
  app.get(
    '/product-page/:sku',
    {
      schema: {
        tags: ['product'],
        summary: 'Everything the product page needs, in one call',
        description:
          'Aggregates catalog, pricing and inventory in parallel. Catalog is required; ' +
          'pricing and inventory are optional and listed in `degraded` when unavailable.',
        params: Type.Object({ sku: Sku }),
        response: { 200: ProductPageSchema, 404: ErrorSchema, 503: ErrorSchema },
      },
    },
    async (request, reply) => {
      const { sku } = request.params;
      const ctx = { requestId: request.id };
      const degradation = new Degradation(request.log);

      // The three calls run in parallel: the page costs max(latencies), not their sum.
      // Catalog is not wrapped: without it there is no page to show (-> 503 via error handler).
      const [product, prices, stock] = await Promise.all([
        data.product(sku, ctx),
        degradation.optional('pricing', data.prices([sku], ctx)),
        degradation.optional('inventory', data.stock([sku], ctx)),
      ]);

      if (!product) {
        return reply.code(404).send({ error: 'NotFound', message: `Product ${sku} not found` });
      }

      const price = prices?.get(sku);
      degradation.applyHeader(reply);
      return {
        ...product,
        price: price ? toPriceView(price) : null,
        availability: toAvailability(stock?.get(sku)),
        degraded: degradation.services,
      };
    },
  );

  // Price of a single product. Used by the "naive" front-end in the benchmark,
  // which fetches the price of every cart line one by one.
  app.get(
    '/products/:sku/price',
    {
      schema: {
        tags: ['product'],
        summary: 'Price of a single product',
        params: Type.Object({ sku: Sku }),
        response: { 200: PriceViewSchema, 404: ErrorSchema, 503: ErrorSchema },
      },
    },
    async (request, reply) => {
      const prices = await data.prices([request.params.sku], { requestId: request.id });
      const price = prices.get(request.params.sku);
      if (!price) return reply.code(404).send({ error: 'NotFound', message: 'Unknown product' });
      return toPriceView(price);
    },
  );
}
