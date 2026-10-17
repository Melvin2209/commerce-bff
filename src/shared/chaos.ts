import { Type, type Static } from 'typebox';
import type { App } from './http-app.js';

export const ChaosConfigSchema = Type.Object({
  latencyMinMs: Type.Integer({ minimum: 0 }),
  latencyMaxMs: Type.Integer({ minimum: 0 }),
  /** Probability (0..1) that a request fails with a 503. */
  errorRate: Type.Number({ minimum: 0, maximum: 1 }),
});
export type ChaosConfig = Static<typeof ChaosConfigSchema>;

export const NO_CHAOS: ChaosConfig = { latencyMinMs: 0, latencyMaxMs: 0, errorRate: 0 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Simulates an unreliable network/service: every business request waits a
 * random delay in [latencyMinMs, latencyMaxMs] and may fail with a 503.
 *
 * The config can be changed at runtime with PUT /__chaos, which is handy for
 * demos ("let's kill the inventory service") and integration tests.
 */
export function registerChaos(app: App, initial: ChaosConfig, random: () => number = Math.random) {
  const config: ChaosConfig = { ...initial };
  const isExempt = (url: string) => url.startsWith('/health') || url.startsWith('/__chaos');

  app.addHook('onRequest', async (request, reply) => {
    if (isExempt(request.url)) return;

    const span = Math.max(0, config.latencyMaxMs - config.latencyMinMs);
    const delay = config.latencyMinMs + Math.round(random() * span);
    if (delay > 0) await sleep(delay);

    if (random() < config.errorRate) {
      request.log.warn({ chaos: true }, 'chaos: injecting a 503');
      return reply.code(503).send({ error: 'ServiceUnavailable', message: 'Injected failure' });
    }
  });

  app.get('/__chaos', async () => config);

  app.put('/__chaos', { schema: { body: Type.Partial(ChaosConfigSchema) } }, async (request) => {
    Object.assign(config, request.body);
    return config;
  });

  return config;
}

/** Reads the chaos settings of a service from CHAOS_* environment variables. */
export function chaosFromEnv(env: NodeJS.ProcessEnv = process.env): ChaosConfig {
  const num = (name: string, fallback: number) => {
    const raw = env[name];
    return raw === undefined || raw === '' ? fallback : Number(raw);
  };
  return {
    latencyMinMs: num('CHAOS_LATENCY_MIN_MS', 0),
    latencyMaxMs: num('CHAOS_LATENCY_MAX_MS', 0),
    errorRate: num('CHAOS_ERROR_RATE', 0),
  };
}
