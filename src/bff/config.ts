import { envNumber, envString } from '../shared/env.js';
import type { CacheTtls } from './cache/cache.js';
import type { ResilienceOptions } from './clients/service-client.js';

export interface BffConfig {
  port: number;
  logger?: boolean;
  services: { catalog: string; pricing: string; inventory: string };
  auth: { tokenUrl: string; clientId: string; clientSecret: string };
  resilience: ResilienceOptions;
  redis: { url: string; keyPrefix: string };
  cacheTtlSeconds: CacheTtls;
  rateLimit: { max: number; timeWindowMs: number };
}

export function configFromEnv(): BffConfig {
  return {
    port: envNumber('PORT', 3000),
    services: {
      catalog: envString('CATALOG_URL', 'http://catalog:4001'),
      pricing: envString('PRICING_URL', 'http://pricing:4002'),
      inventory: envString('INVENTORY_URL', 'http://inventory:4003'),
    },
    auth: {
      tokenUrl: envString('AUTH_TOKEN_URL', 'http://auth:4000/oauth/token'),
      clientId: envString('BFF_CLIENT_ID', 'commerce-bff'),
      clientSecret: envString('BFF_CLIENT_SECRET', 'dev-bff-secret'),
    },
    resilience: {
      timeoutMs: envNumber('UPSTREAM_TIMEOUT_MS', 800),
      retries: envNumber('UPSTREAM_RETRIES', 2),
      retryBaseDelayMs: envNumber('UPSTREAM_RETRY_BASE_DELAY_MS', 50),
      retryMaxDelayMs: envNumber('UPSTREAM_RETRY_MAX_DELAY_MS', 500),
      breakerFailureThreshold: envNumber('BREAKER_FAILURE_THRESHOLD', 5),
      breakerResetTimeoutMs: envNumber('BREAKER_RESET_TIMEOUT_MS', 10_000),
    },
    redis: {
      url: envString('REDIS_URL', 'redis://redis:6379'),
      keyPrefix: envString('REDIS_KEY_PREFIX', 'bff:'),
    },
    cacheTtlSeconds: {
      product: envNumber('CACHE_TTL_PRODUCT_SECONDS', 600),
      price: envNumber('CACHE_TTL_PRICE_SECONDS', 60),
      stock: envNumber('CACHE_TTL_STOCK_SECONDS', 10),
    },
    rateLimit: {
      max: envNumber('RATE_LIMIT_MAX', 300),
      timeWindowMs: envNumber('RATE_LIMIT_WINDOW_MS', 60_000),
    },
  };
}
