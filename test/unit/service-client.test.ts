import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { UpstreamError } from '../../src/bff/clients/errors.js';
import { ServiceClient } from '../../src/bff/clients/service-client.js';
import type { TokenManager } from '../../src/bff/clients/token-manager.js';

function fakeTokens() {
  let n = 0;
  return {
    getToken: vi.fn(async () => `token-${n}`),
    invalidate: vi.fn(() => {
      n++;
    }),
  };
}

function client(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  tokens = fakeTokens(),
) {
  return {
    tokens,
    client: new ServiceClient({
      name: 'pricing',
      baseUrl: 'http://pricing',
      tokens: tokens as unknown as TokenManager,
      logger: pino({ level: 'silent' }),
      fetch: fetchImpl as typeof fetch,
      timeoutMs: 50,
      retries: 2,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 2,
      breakerFailureThreshold: 2,
      breakerResetTimeoutMs: 10_000,
    }),
  };
}

describe('ServiceClient', () => {
  it('sends the bearer token and the request id', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ ok: 1 }));
    const { client: c } = client(fetchImpl);
    await expect(c.get('/prices/SL-1', { requestId: 'req-1' })).resolves.toEqual({ ok: 1 });
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer token-0');
    expect(headers['x-request-id']).toBe('req-1');
  });

  it('retries 5xx errors then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: 1 }));
    await expect(client(fetchImpl).client.get('/x')).resolves.toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns null on 404 without retrying', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    await expect(client(fetchImpl).client.get('/x')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('times out slow responses', async () => {
    const slow = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const error = await client(slow)
      .client.get('/x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as UpstreamError).kind).toBe('timeout');
  });

  it('refreshes the token once on 401', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: 1 }));
    const { client: c, tokens } = client(fetchImpl);
    await expect(c.get('/x')).resolves.toEqual({ ok: 1 });
    expect(tokens.invalidate).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after repeated failures and stops calling the service', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }));
    const { client: c } = client(fetchImpl);
    await c.get('/x').catch(() => {});
    await c.get('/x').catch(() => {});
    const callsBefore = fetchImpl.mock.calls.length;

    const error = (await c.get('/x').catch((e: unknown) => e)) as UpstreamError;
    expect(error.kind).toBe('circuit_open');
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });
});
