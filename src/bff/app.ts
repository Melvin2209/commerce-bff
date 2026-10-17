import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { createBaseApp } from '../shared/http-app.js';
import { InMemoryCartStore, type CartStore } from './cart/cart-store.js';
import { UpstreamError } from './clients/errors.js';
import { ServiceClient } from './clients/service-client.js';
import { TokenManager } from './clients/token-manager.js';
import type { BffConfig } from './config.js';
import { ShopData } from './data.js';
import { registerCartRoutes } from './routes/cart.js';
import { registerProductRoutes } from './routes/product-page.js';

export interface BffDependencies {
  carts?: CartStore;
}

export async function buildBffApp(config: BffConfig, deps: BffDependencies = {}) {
  const app = createBaseApp('bff', { logger: config.logger });

  // One token for all services: the BFF is a single OAuth2 client.
  const tokens = new TokenManager({ ...config.auth, timeoutMs: config.resilience.timeoutMs });
  const client = (name: keyof BffConfig['services']) =>
    new ServiceClient({
      name,
      baseUrl: config.services[name],
      tokens,
      logger: app.log,
      ...config.resilience,
    });
  const clients = {
    catalog: client('catalog'),
    pricing: client('pricing'),
    inventory: client('inventory'),
  };
  const data = new ShopData(clients);
  const carts = deps.carts ?? new InMemoryCartStore();

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ShopLab commerce BFF',
        description:
          'Backend-for-Frontend of the fictional ShopLab store. Aggregates the catalog, ' +
          'pricing and inventory services into responses shaped for the web front-end.',
        version: '1.0.0',
      },
      tags: [
        { name: 'product', description: 'Product page' },
        { name: 'cart', description: 'Guest cart (identified by the x-cart-id header)' },
        { name: 'ops', description: 'Operational endpoints' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Upstream failures that could not be degraded (e.g. catalog down on the
  // product page) become a clean 503 instead of a generic 500.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof UpstreamError) {
      request.log.error({ service: error.service, kind: error.kind }, error.message);
      return reply
        .code(503)
        .send({ error: 'ServiceUnavailable', message: `${error.service} is unavailable` });
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error(error);
    return reply.code(status).send({
      error: status >= 500 ? 'InternalServerError' : 'BadRequest',
      message: status >= 500 ? 'Something went wrong' : (error as Error).message,
    });
  });

  app.get('/health/upstreams', { schema: { tags: ['ops'] } }, async () => ({
    circuits: Object.fromEntries(Object.values(clients).map((c) => [c.name, c.breaker.getState()])),
  }));

  registerProductRoutes(app, data);
  registerCartRoutes(app, data, carts);

  return app;
}
