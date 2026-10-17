import { describe, expect, it, vi } from 'vitest';
import { TokenError, TokenManager } from '../../src/bff/clients/token-manager.js';

/** Fake auth server: returns token-1, token-2... valid for 100 seconds. */
function fakeAuth() {
  let counter = 0;
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    counter++;
    return Response.json({ access_token: `token-${counter}`, expires_in: 100 });
  });
}

function setup(fetchImpl: ReturnType<typeof vi.fn>) {
  let now = 0;
  const manager = new TokenManager({
    tokenUrl: 'http://auth/oauth/token',
    clientId: 'bff',
    clientSecret: 'secret',
    fetch: fetchImpl as unknown as typeof fetch,
    now: () => now,
  });
  return { manager, advance: (ms: number) => (now += ms) };
}

describe('TokenManager', () => {
  it('caches the token between calls', async () => {
    const fetchImpl = fakeAuth();
    const { manager } = setup(fetchImpl);
    expect(await manager.getToken()).toBe('token-1');
    expect(await manager.getToken()).toBe('token-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends client credentials with HTTP Basic auth', async () => {
    const fetchImpl = fakeAuth();
    await setup(fetchImpl).manager.getToken();
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from('bff:secret').toString('base64')}`);
    expect(String(init.body)).toBe('grant_type=client_credentials');
  });

  it('renews the token at 80% of its lifetime', async () => {
    const fetchImpl = fakeAuth();
    const { manager, advance } = setup(fetchImpl);
    await manager.getToken();
    advance(79_000);
    expect(await manager.getToken()).toBe('token-1');
    advance(2_000); // 81s > 80% of 100s
    expect(await manager.getToken()).toBe('token-2');
  });

  it('makes a single call when many requests need a token at once', async () => {
    const fetchImpl = fakeAuth();
    const { manager } = setup(fetchImpl);
    const tokens = await Promise.all(Array.from({ length: 50 }, () => manager.getToken()));
    expect(new Set(tokens)).toEqual(new Set(['token-1']));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps using a still-valid token if the refresh fails', async () => {
    const fetchImpl = fakeAuth();
    const { manager, advance } = setup(fetchImpl);
    await manager.getToken();
    fetchImpl.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    advance(90_000); // past refresh time but before expiry
    expect(await manager.getToken()).toBe('token-1');
  });

  it('fails once the token is expired and the auth server is down', async () => {
    const fetchImpl = fakeAuth();
    const { manager, advance } = setup(fetchImpl);
    await manager.getToken();
    fetchImpl.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    advance(101_000);
    await expect(manager.getToken()).rejects.toBeInstanceOf(TokenError);
  });

  it('fetches a new token after invalidate()', async () => {
    const fetchImpl = fakeAuth();
    const { manager } = setup(fetchImpl);
    await manager.getToken();
    manager.invalidate();
    expect(await manager.getToken()).toBe('token-2');
  });

  it('reports HTTP errors from the auth server', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }));
    await expect(setup(fetchImpl).manager.getToken()).rejects.toThrow(/HTTP 401/);
  });
});
