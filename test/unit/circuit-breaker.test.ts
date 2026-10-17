import { describe, expect, it } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '../../src/bff/clients/circuit-breaker.js';

function setup(isFailure?: (e: unknown) => boolean) {
  let now = 0;
  const transitions: string[] = [];
  const breaker = new CircuitBreaker('test', {
    failureThreshold: 3,
    resetTimeoutMs: 1_000,
    isFailure,
    now: () => now,
    onStateChange: (from, to) => transitions.push(`${from}->${to}`),
  });
  return { breaker, transitions, advance: (ms: number) => (now += ms) };
}

const fail = () => Promise.reject(new Error('down'));
const succeed = () => Promise.resolve('ok');

async function failTimes(breaker: CircuitBreaker, n: number) {
  for (let i = 0; i < n; i++) await breaker.execute(fail).catch(() => {});
}

describe('CircuitBreaker', () => {
  it('stays closed below the failure threshold', async () => {
    const { breaker } = setup();
    await failTimes(breaker, 2);
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('opens after N consecutive failures and then fails fast', async () => {
    const { breaker } = setup();
    await failTimes(breaker, 3);
    expect(breaker.getState()).toBe('OPEN');

    let called = false;
    await expect(
      breaker.execute(async () => {
        called = true;
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(called).toBe(false);
  });

  it('resets the failure count after a success', async () => {
    const { breaker } = setup();
    await failTimes(breaker, 2);
    await breaker.execute(succeed);
    await failTimes(breaker, 2);
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('goes half-open after the reset timeout and closes on a successful trial', async () => {
    const { breaker, advance, transitions } = setup();
    await failTimes(breaker, 3);
    advance(1_000);
    expect(breaker.getState()).toBe('HALF_OPEN');
    await breaker.execute(succeed);
    expect(transitions).toEqual(['CLOSED->OPEN', 'OPEN->HALF_OPEN', 'HALF_OPEN->CLOSED']);
  });

  it('re-opens immediately when the trial fails', async () => {
    const { breaker, advance } = setup();
    await failTimes(breaker, 3);
    advance(1_000);
    await failTimes(breaker, 1);
    expect(breaker.getState()).toBe('OPEN');
  });

  it('lets only one trial request through in half-open', async () => {
    const { breaker, advance } = setup();
    await failTimes(breaker, 3);
    advance(1_000);

    let release!: () => void;
    const slowTrial = breaker.execute(() => new Promise<void>((r) => (release = r)));
    await expect(breaker.execute(succeed)).rejects.toBeInstanceOf(CircuitOpenError);
    release();
    await slowTrial;
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('ignores errors that are not service failures (e.g. 404)', async () => {
    const { breaker } = setup(() => false);
    await failTimes(breaker, 5);
    expect(breaker.getState()).toBe('CLOSED');
  });
});
