import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { buildBffApp, type BffDependencies } from '../../src/bff/app.js';
import type { ResilienceOptions } from '../../src/bff/clients/service-client.js';
import { buildCatalogApp } from '../../src/services/catalog/app.js';
import { buildInventoryApp } from '../../src/services/inventory/app.js';
import { buildPricingApp } from '../../src/services/pricing/app.js';
import type { ServiceOptions } from '../../src/services/common.js';
import type { ChaosConfig } from '../../src/shared/chaos.js';
import { authFor, startAuthServer } from './auth.js';

type ServiceName = 'catalog' | 'pricing' | 'inventory';

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
    serviceOptions?: Partial<ServiceOptions>;
  } = {},
) {
  const auth = await startAuthServer();
  const opts = (name: ServiceName): ServiceOptions => ({
    logger: false,
    auth: authFor(auth.jwksUrl, name),
    ...options.serviceOptions,
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
    async close() {
      await bff.close();
      await Promise.all(Object.values(services).map((s) => s.close()));
      await auth.app.close();
    },
  };
}

export type Stack = Awaited<ReturnType<typeof startStack>>;
