import { Type } from 'typebox';
import { registerChaos, NO_CHAOS } from '../../shared/chaos.js';
import { createBaseApp } from '../../shared/http-app.js';
import { registerJwtAuth } from '../../shared/jwt-auth.js';
import { products, type Product } from '../seed.js';
import {
  ErrorBody,
  SkuParams,
  SkusQuery,
  notFound,
  parseSkus,
  type ServiceOptions,
} from '../common.js';

export const ProductSchema = Type.Object({
  sku: Type.String(),
  name: Type.String(),
  brand: Type.String(),
  category: Type.String(),
  description: Type.String(),
  imageUrl: Type.String(),
});

/** Catalog service: static product information (name, brand, images...). */
export function buildCatalogApp(options: ServiceOptions = {}) {
  const app = createBaseApp('catalog', options);
  registerChaos(app, options.chaos ?? NO_CHAOS);
  if (options.auth) registerJwtAuth(app, options.auth);

  const bySku = new Map<string, Product>(products.map((p) => [p.sku, { ...p }]));

  app.get(
    '/products/:sku',
    { schema: { params: SkuParams, response: { 200: ProductSchema, 404: ErrorBody } } },
    async (request, reply) => {
      const product = bySku.get(request.params.sku);
      return product ?? reply.code(404).send(notFound(request.params.sku));
    },
  );

  app.get(
    '/products',
    {
      schema: {
        querystring: SkusQuery,
        response: {
          200: Type.Object({
            items: Type.Array(ProductSchema),
            missing: Type.Array(Type.String()),
          }),
        },
      },
    },
    async (request) => {
      const skus = parseSkus(request.query.skus);
      const items = skus.flatMap((sku) => bySku.get(sku) ?? []);
      const missing = skus.filter((sku) => !bySku.has(sku));
      return { items, missing };
    },
  );

  return app;
}
