import { envNumber, envString } from '../shared/env.js';
import type { ResilienceOptions } from './clients/service-client.js';

export interface BffConfig {
  port: number;
  logger?: boolean;
  services: { catalog: string; pricing: string; inventory: string };
  auth: { tokenUrl: string; clientId: string; clientSecret: string };
  resilience: ResilienceOptions;
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
  };
}
