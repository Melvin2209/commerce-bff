export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Consecutive failures that open the circuit. */
  failureThreshold: number;
  /** How long the circuit stays open before letting a trial request through. */
  resetTimeoutMs: number;
  /** Decides whether an error counts as a failure (e.g. a 404 should not). */
  isFailure?: (error: unknown) => boolean;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  now?: () => number;
}

export class CircuitOpenError extends Error {
  constructor(readonly circuit: string) {
    super(`Circuit "${circuit}" is open`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Classic three-state circuit breaker.
 *
 *   CLOSED ──(N consecutive failures)──► OPEN ──(reset timeout)──► HALF_OPEN
 *     ▲                                   ▲                            │
 *     └────────────(trial succeeds)───────┼────────(trial fails)───────┘
 *
 * While OPEN we fail immediately without calling the service: the user gets
 * a fast (degraded) answer and the struggling service gets time to recover.
 * In HALF_OPEN a single trial request decides whether to close again.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private trialInProgress = false;
  private readonly now: () => number;

  constructor(
    readonly name: string,
    private readonly options: CircuitBreakerOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  getState(): CircuitState {
    // The OPEN -> HALF_OPEN transition is time based, so it is evaluated lazily.
    if (this.state === 'OPEN' && this.now() - this.openedAt >= this.options.resetTimeoutMs) {
      this.transition('HALF_OPEN');
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();
    if (state === 'OPEN') throw new CircuitOpenError(this.name);
    // Only one trial at a time in HALF_OPEN; the others fail fast.
    if (state === 'HALF_OPEN' && this.trialInProgress) throw new CircuitOpenError(this.name);

    this.trialInProgress = state === 'HALF_OPEN';
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      const isFailure = this.options.isFailure?.(error) ?? true;
      if (isFailure) this.onFailure();
      else this.onSuccess(); // e.g. a 404: the service answered, so it is healthy
      throw error;
    } finally {
      this.trialInProgress = false;
    }
  }

  private onSuccess() {
    this.consecutiveFailures = 0;
    if (this.state !== 'CLOSED') this.transition('CLOSED');
  }

  private onFailure() {
    this.consecutiveFailures++;
    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.options.failureThreshold) {
      this.openedAt = this.now();
      if (this.state !== 'OPEN') this.transition('OPEN');
    }
  }

  private transition(to: CircuitState) {
    const from = this.state;
    this.state = to;
    this.options.onStateChange?.(from, to);
  }
}
