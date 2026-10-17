export type UpstreamErrorKind = 'timeout' | 'network' | 'http' | 'circuit_open' | 'auth';

/** Any failure while calling a downstream service, with enough context to decide what to do. */
export class UpstreamError extends Error {
  constructor(
    readonly service: string,
    readonly kind: UpstreamErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(`[${service}] ${message}`);
    this.name = 'UpstreamError';
  }

  /**
   * Worth retrying: timeouts, network errors, 5xx and 429. A 4xx means our
   * request is wrong (or the item does not exist): retrying will not help.
   */
  get retryable(): boolean {
    if (this.kind === 'timeout' || this.kind === 'network') return true;
    if (this.kind === 'http' && this.status !== undefined) {
      return this.status >= 500 || this.status === 429;
    }
    return false;
  }

  /** Counts against the circuit breaker: the service itself looks unhealthy. */
  get isServiceFailure(): boolean {
    return this.retryable;
  }
}
