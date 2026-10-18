import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStack, type Stack } from '../helpers/stack.js';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ rateLimitMax: 3 });
});
afterAll(async () => {
  await stack.close();
});

describe('rate limiting', () => {
  it('returns 429 once the client exceeds its quota', async () => {
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await stack.bff.inject('/product-page/SL-1001')).statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('exposes the quota in response headers', async () => {
    await stack.flushRedis();
    const res = await stack.bff.inject('/product-page/SL-1001');
    expect(res.headers['x-ratelimit-limit']).toBe('3');
    expect(res.headers['x-ratelimit-remaining']).toBe('2');
  });

  it('never limits health checks', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await stack.bff.inject('/health')).statusCode).toBe(200);
    }
  });
});
