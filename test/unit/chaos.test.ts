import { describe, expect, it } from 'vitest';
import { chaosFromEnv, registerChaos } from '../../src/shared/chaos.js';
import { createBaseApp } from '../../src/shared/http-app.js';

function appWithChaos(errorRate: number, random: () => number) {
  const app = createBaseApp('test', { logger: false });
  registerChaos(app, { latencyMinMs: 0, latencyMaxMs: 0, errorRate }, random);
  app.get('/ping', async () => ({ pong: true }));
  return app;
}

describe('chaos plugin', () => {
  it('fails requests when the random draw is below the error rate', async () => {
    const app = appWithChaos(0.5, () => 0.1);
    const res = await app.inject('/ping');
    expect(res.statusCode).toBe(503);
  });

  it('lets requests through otherwise', async () => {
    const app = appWithChaos(0.5, () => 0.9);
    expect((await app.inject('/ping')).statusCode).toBe(200);
  });

  it('never affects /health', async () => {
    const app = appWithChaos(1, () => 0);
    expect((await app.inject('/health')).statusCode).toBe(200);
  });

  it('can be reconfigured at runtime', async () => {
    const app = appWithChaos(1, () => 0);
    await app.inject({ method: 'PUT', url: '/__chaos', payload: { errorRate: 0 } });
    expect((await app.inject('/ping')).statusCode).toBe(200);
  });

  it('reads its settings from the environment', () => {
    expect(
      chaosFromEnv({
        CHAOS_LATENCY_MIN_MS: '10',
        CHAOS_LATENCY_MAX_MS: '50',
        CHAOS_ERROR_RATE: '0.2',
      }),
    ).toEqual({ latencyMinMs: 10, latencyMaxMs: 50, errorRate: 0.2 });
  });
});
