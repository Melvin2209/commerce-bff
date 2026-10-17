import { Type } from 'typebox';
import { registerChaos, NO_CHAOS } from '../../shared/chaos.js';
import { createBaseApp } from '../../shared/http-app.js';
import { stock } from '../seed.js';
import {
  ErrorBody,
  SkuParams,
  SkusQuery,
  notFound,
  parseSkus,
  type ServiceOptions,
} from '../common.js';

export const LOW_STOCK_THRESHOLD = 5;

export const StockSchema = Type.Object({
  sku: Type.String(),
  quantity: Type.Integer(),
  status: Type.Union([
    Type.Literal('in_stock'),
    Type.Literal('low_stock'),
    Type.Literal('out_of_stock'),
  ]),
});

export function stockStatus(quantity: number) {
  if (quantity <= 0) return 'out_of_stock' as const;
  if (quantity < LOW_STOCK_THRESHOLD) return 'low_stock' as const;
  return 'in_stock' as const;
}

const toDto = (sku: string, quantity: number) => ({ sku, quantity, status: stockStatus(quantity) });

/** Inventory service: available quantity per SKU. */
export function buildInventoryApp(options: ServiceOptions = {}) {
  const app = createBaseApp('inventory', options);
  registerChaos(app, options.chaos ?? NO_CHAOS);

  const quantities = new Map<string, number>(stock.map((s) => [s.sku, s.quantity]));

  app.get(
    '/stock/:sku',
    { schema: { params: SkuParams, response: { 200: StockSchema, 404: ErrorBody } } },
    async (request, reply) => {
      const quantity = quantities.get(request.params.sku);
      if (quantity === undefined) return reply.code(404).send(notFound(request.params.sku));
      return toDto(request.params.sku, quantity);
    },
  );

  app.get(
    '/stock',
    {
      schema: {
        querystring: SkusQuery,
        response: {
          200: Type.Object({ items: Type.Array(StockSchema), missing: Type.Array(Type.String()) }),
        },
      },
    },
    async (request) => {
      const skus = parseSkus(request.query.skus);
      const items = skus.flatMap((sku) => {
        const quantity = quantities.get(sku);
        return quantity === undefined ? [] : [toDto(sku, quantity)];
      });
      return { items, missing: skus.filter((sku) => !quantities.has(sku)) };
    },
  );

  app.put(
    '/stock/:sku',
    {
      schema: {
        params: SkuParams,
        body: Type.Object({ quantity: Type.Integer({ minimum: 0 }) }),
        response: { 200: StockSchema, 404: ErrorBody },
      },
    },
    async (request, reply) => {
      const { sku } = request.params;
      if (!quantities.has(sku)) return reply.code(404).send(notFound(sku));
      quantities.set(sku, request.body.quantity);
      await options.publish?.({ type: 'stock.updated', sku });
      return toDto(sku, request.body.quantity);
    },
  );

  return app;
}
