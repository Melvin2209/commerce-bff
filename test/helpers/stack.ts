import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { buildBffApp, type BffDependencies } from '../../src/bff/app.js';
import type { ResilienceOptions } from '../../src/bff/clients/service-client.js';
import { buildCatalogApp } from '../../src/services/catalog/app.js';
import { buildInventoryApp } from '../../src/services/inventory/app.js';
import { buildPricingApp } from '../../src/services/pricing/app.js';
import type { ServiceOptions } from '../../src/services/common.js';
import type { ChaosConfig } from '../../src/shared/chaos.js';
import { CHANGE_CHANNEL } from '../../src/shared/events.js';
import { authFor, startAuthServer } from './auth.js';

type ServiceName = 'catalog' | 'pricing' | 'inventory';

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

async function listen(app: FastifyInstance) {
  await app.listen({ port: 0, host: '127.0.0.1' });
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

/** Fast settings so failure scenarios run in milliseconds. */
export const TEST_RESILIENCE: ResilienceOptions = {
  timeoutMs: 150,
  retries: 1,
  retryBaseDelayMs: 5,
  retryMaxDelayMs: 10,
  breakerFailureThreshold: 3,
  breakerResetTimeoutMs: 300,
};

/**
 * Starts the whole system on random ports: auth server, the three simulated
 * services (real HTTP + real JWT checks) and the BFF (used via inject()).
 */
export async function startStack(
  options: {
    resilience?: Partial<ResilienceOptions>;
    deps?: BffDependencies;
    rateLimitMax?: number;
  } = {},
) {
  const auth = await startAuthServer();
  // Each stack gets its own key prefix so test files can share one Redis.
  const keyPrefix = `test:${randomUUID()}:`;
  const publisher = new Redis(REDIS_URL);
  const opts = (name: ServiceName): ServiceOptions => ({
    logger: false,
    auth: authFor(auth.jwksUrl, name),
    publish: async (event) => {
      await publisher.publish(CHANGE_CHANNEL, JSON.stringify(event));
    },
  });
  const services = {
    catalog: buildCatalogApp(opts('catalog')),
    pricing: buildPricingApp(opts('pricing')),
    inventory: buildInventoryApp(opts('inventory')),
  };
  const urls = {
    catalog: await listen(services.catalog),
    pricing: await listen(services.pricing),
    inventory: await listen(services.inventory),
  };

  const bff = await buildBffApp(
    {
      port: 0,
      logger: false,
      services: urls,
      auth: {
        tokenUrl: `${auth.url}/oauth/token`,
        clientId: 'commerce-bff',
        clientSecret: 'bff-secret',
      },
      resilience: { ...TEST_RESILIENCE, ...options.resilience },
      redis: { url: REDIS_URL, keyPrefix },
      cacheTtlSeconds: { product: 60, price: 60, stock: 60 },
      rateLimit: { max: options.rateLimitMax ?? 100_000, timeWindowMs: 60_000 },
    },
    options.deps,
  );

  return {
    bff,
    auth,
    urls,
    /** Changes the latency / error rate of a service at runtime. */
    async chaos(service: ServiceName, config: Partial<ChaosConfig>) {
      await fetch(`${urls[service]}/__chaos`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ latencyMinMs: 0, latencyMaxMs: 0, errorRate: 0, ...config }),
      });
    },
    /** Direct access to the service apps (e.g. to update a price via inject). */
    services,
    keyPrefix,
    /** Deletes every Redis key of this stack (cache, carts, rate-limit counters). */
    async flushRedis() {
      const keys = await publisher.keys(`${keyPrefix}*`);
      if (keys.length > 0) await publisher.del(...keys);
    },
    /** Deletes only cached service data (keeps carts). */
    async flushCache() {
      const keys = (
        await Promise.all(
          ['product', 'price', 'stock'].map((kind) => publisher.keys(`${keyPrefix}${kind}:*`)),
        )
      ).flat();
      if (keys.length > 0) await publisher.del(...keys);
    },
    async close() {
      await bff.close();
      publisher.disconnect();
      await Promise.all(Object.values(services).map((s) => s.close()));
      await auth.app.close();
    },
  };
}

export type Stack = Awaited<ReturnType<typeof startStack>>;
