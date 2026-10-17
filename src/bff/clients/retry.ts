export interface RetryOptions {
  /** Retries after the first attempt (2 => up to 3 attempts). */
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Exponential backoff with "full jitter": the n-th retry waits a random time
 * in [0, min(maxDelay, baseDelay * 2^n)].
 *
 * The randomness matters: if 1000 clients fail at the same moment and all
 * retry after exactly 100ms, they hit the recovering service all together
 * again. Jitter spreads them out.
 */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.round(random() * ceiling);
}

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= options.retries || !options.shouldRetry(error)) throw error;

      const delay = backoffDelay(attempt, options.baseDelayMs, options.maxDelayMs, options.random);
      options.onRetry?.(error, attempt + 1, delay);
      await sleep(delay);
    }
  }
}
