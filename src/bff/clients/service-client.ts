import type { FastifyBaseLogger } from 'fastify';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';
import { UpstreamError } from './errors.js';
import { retry } from './retry.js';
import type { TokenManager } from './token-manager.js';

export interface ResilienceOptions {
  timeoutMs: number;
  retries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  breakerFailureThreshold: number;
  breakerResetTimeoutMs: number;
}

export interface ServiceClientOptions extends ResilienceOptions {
  name: string;
  baseUrl: string;
  tokens: TokenManager;
  logger: FastifyBaseLogger;
  fetch?: typeof fetch;
}

export interface CallContext {
  /** Propagated as x-request-id so logs can be correlated across services. */
  requestId?: string;
}

/**
 * HTTP client for one downstream service. Every call goes through:
 *
 *   circuit breaker  →  retry with backoff  →  single attempt (timeout + bearer token)
 *
 * The breaker wraps the retries so one logical call counts as one success or
 * failure, and an open circuit stops the retries immediately.
 */
export class ServiceClient {
  readonly breaker: CircuitBreaker;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: ServiceClientOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.breaker = new CircuitBreaker(options.name, {
      failureThreshold: options.breakerFailureThreshold,
      resetTimeoutMs: options.breakerResetTimeoutMs,
      isFailure: (error) => error instanceof UpstreamError && error.isServiceFailure,
      onStateChange: (from, to) =>
        options.logger.warn({ service: options.name, from, to }, 'circuit breaker state change'),
    });
  }

  get name() {
    return this.options.name;
  }

  /** GET a JSON resource. Returns null on 404. Throws UpstreamError otherwise. */
  async get<T>(path: string, context: CallContext = {}): Promise<T | null> {
    try {
      return await this.breaker.execute(() =>
        retry(() => this.attempt<T>(path, context), {
          retries: this.options.retries,
          baseDelayMs: this.options.retryBaseDelayMs,
          maxDelayMs: this.options.retryMaxDelayMs,
          shouldRetry: (error) => error instanceof UpstreamError && error.retryable,
          onRetry: (error, attempt, delayMs) =>
            this.options.logger.warn(
              { service: this.name, path, attempt, delayMs, err: (error as Error).message },
              'retrying upstream call',
            ),
        }),
      );
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        throw new UpstreamError(this.name, 'circuit_open', 'circuit open, call skipped');
      }
      throw error;
    }
  }

  private async attempt<T>(
    path: string,
    context: CallContext,
    isAuthRetry = false,
  ): Promise<T | null> {
    let token: string;
    try {
      token = await this.options.tokens.getToken();
    } catch (error) {
      throw new UpstreamError(this.name, 'auth', (error as Error).message);
    }

    let res: Response;
    const startedAt = performance.now();
    try {
      res = await this.fetchFn(`${this.options.baseUrl}${path}`, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(context.requestId && { 'x-request-id': context.requestId }),
        },
        // Abort if the service is too slow: a slow answer is often worse than none.
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const isTimeout = (error as Error).name === 'TimeoutError';
      throw new UpstreamError(
        this.name,
        isTimeout ? 'timeout' : 'network',
        isTimeout ? `timeout after ${this.options.timeoutMs}ms` : (error as Error).message,
      );
    }

    this.options.logger.debug(
      {
        service: this.name,
        path,
        status: res.status,
        durationMs: Math.round(performance.now() - startedAt),
        requestId: context.requestId,
      },
      'upstream call',
    );

    // 401: our cached token may have been revoked or the keys rotated.
    // Get a fresh token and try once more (outside of the normal retry budget).
    if (res.status === 401 && !isAuthRetry) {
      this.options.tokens.invalidate();
      return this.attempt<T>(path, context, true);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new UpstreamError(this.name, 'http', `HTTP ${res.status}`, res.status);

    return (await res.json()) as T;
  }
}
