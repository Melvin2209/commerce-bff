export interface TokenManagerOptions {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  /** Renew the token once this fraction of its lifetime has elapsed (default 0.8). */
  refreshRatio?: number;
  timeoutMs?: number;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  now?: () => number;
}

interface CachedToken {
  value: string;
  /** After this instant we try to renew it... */
  refreshAt: number;
  /** ...and after this one it can no longer be used at all. */
  expiresAt: number;
}

export class TokenError extends Error {}

/**
 * Gets and caches the OAuth2 access token the BFF uses to call the services.
 *
 * - Cache: one token is reused for every request until it is close to expiry,
 *   instead of hitting the auth server on every call.
 * - Early refresh: the token is renewed at 80% of its lifetime so a request
 *   never leaves with a token that expires on the way.
 * - Single-flight: if 100 requests need a new token at the same time, only
 *   one call is made to the auth server and they all await the same promise.
 */
export class TokenManager {
  private cached: CachedToken | null = null;
  private inFlight: Promise<string> | null = null;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  /** Number of calls made to the auth server (exposed for tests and metrics). */
  fetchCount = 0;

  constructor(private readonly options: TokenManagerOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async getToken(): Promise<string> {
    const now = this.now();
    if (this.cached && now < this.cached.refreshAt) return this.cached.value;

    this.inFlight ??= this.renew().finally(() => {
      this.inFlight = null;
    });

    try {
      return await this.inFlight;
    } catch (err) {
      // The auth server is down but our current token is still valid:
      // keep using it rather than failing the user's request.
      if (this.cached && now < this.cached.expiresAt) return this.cached.value;
      throw err;
    }
  }

  /** Called when a service answers 401: the token was revoked or keys rotated. */
  invalidate(): void {
    this.cached = null;
  }

  private async renew(): Promise<string> {
    const { tokenUrl, clientId, clientSecret, scope } = this.options;
    const body = new URLSearchParams({ grant_type: 'client_credentials' });
    if (scope) body.set('scope', scope);

    this.fetchCount++;
    const startedAt = this.now();
    let res: Response;
    try {
      res = await this.fetchFn(tokenUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 2_000),
      });
    } catch (err) {
      throw new TokenError(`Auth server unreachable: ${(err as Error).message}`);
    }

    if (!res.ok) throw new TokenError(`Token request failed with HTTP ${res.status}`);

    const json = (await res.json()) as { access_token: string; expires_in: number };
    const lifetimeMs = json.expires_in * 1_000;
    // Measure from when we *sent* the request: the token was issued at that time at the latest.
    this.cached = {
      value: json.access_token,
      refreshAt: startedAt + lifetimeMs * (this.options.refreshRatio ?? 0.8),
      expiresAt: startedAt + lifetimeMs,
    };
    return json.access_token;
  }
}
