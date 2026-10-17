import { Type } from 'typebox';
import { registerChaos, NO_CHAOS } from '../../shared/chaos.js';
import { createBaseApp } from '../../shared/http-app.js';
import { registerJwtAuth } from '../../shared/jwt-auth.js';
import { prices, promotions, type PriceEntry } from '../seed.js';
import {
  ErrorBody,
  SkuParams,
  SkusQuery,
  notFound,
  parseSkus,
  type ServiceOptions,
} from '../common.js';
import { computePrice } from './promotions.js';

export const PriceSchema = Type.Object({
  sku: Type.String(),
  currency: Type.Literal('EUR'),
  basePriceCents: Type.Integer(),
  finalPriceCents: Type.Integer(),
  promotion: Type.Union([
    Type.Object({ id: Type.String(), label: Type.String(), discountCents: Type.Integer() }),
    Type.Null(),
  ]),
});

/** Pricing service: base prices + promotions, returns the final price. */
export function buildPricingApp(options: ServiceOptions = {}) {
  const app = createBaseApp('pricing', options);
  registerChaos(app, options.chaos ?? NO_CHAOS);
  if (options.auth) registerJwtAuth(app, options.auth);

  const bySku = new Map<string, PriceEntry>(prices.map((p) => [p.sku, { ...p }]));

  app.get(
    '/prices/:sku',
    { schema: { params: SkuParams, response: { 200: PriceSchema, 404: ErrorBody } } },
    async (request, reply) => {
      const entry = bySku.get(request.params.sku);
      if (!entry) return reply.code(404).send(notFound(request.params.sku));
      return computePrice(entry, promotions);
    },
  );

  app.get(
    '/prices',
    {
      schema: {
        querystring: SkusQuery,
        response: {
          200: Type.Object({ items: Type.Array(PriceSchema), missing: Type.Array(Type.String()) }),
        },
      },
    },
    async (request) => {
      const skus = parseSkus(request.query.skus);
      const items = skus.flatMap((sku) => {
        const entry = bySku.get(sku);
        return entry ? [computePrice(entry, promotions)] : [];
      });
      return { items, missing: skus.filter((sku) => !bySku.has(sku)) };
    },
  );

  // Back-office style write, used to demo cache invalidation.
  app.put(
    '/prices/:sku',
    {
      schema: {
        params: SkuParams,
        body: Type.Object({ basePriceCents: Type.Integer({ minimum: 0 }) }),
        response: { 200: PriceSchema, 404: ErrorBody },
      },
    },
    async (request, reply) => {
      const entry = bySku.get(request.params.sku);
      if (!entry) return reply.code(404).send(notFound(request.params.sku));
      entry.basePriceCents = request.body.basePriceCents;
      await options.publish?.({ type: 'price.updated', sku: entry.sku });
      return computePrice(entry, promotions);
    },
  );

  return app;
}
