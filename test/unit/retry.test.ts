import { describe, expect, it, vi } from 'vitest';
import { backoffDelay, retry } from '../../src/bff/clients/retry.js';

const noSleep = vi.fn(async () => {});

describe('backoffDelay', () => {
  it('grows exponentially and is capped', () => {
    const max = () => 1; // worst case of the jitter
    expect(backoffDelay(0, 50, 1_000, max)).toBe(50);
    expect(backoffDelay(1, 50, 1_000, max)).toBe(100);
    expect(backoffDelay(2, 50, 1_000, max)).toBe(200);
    expect(backoffDelay(10, 50, 1_000, max)).toBe(1_000);
  });

  it('applies full jitter', () => {
    expect(backoffDelay(2, 50, 1_000, () => 0.5)).toBe(100);
    expect(backoffDelay(2, 50, 1_000, () => 0)).toBe(0);
  });
});

describe('retry', () => {
  const options = { retries: 2, baseDelayMs: 10, maxDelayMs: 100, sleep: noSleep };

  it('returns as soon as an attempt succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    await expect(retry(fn, { ...options, shouldRetry: () => true })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured number of retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(retry(fn, { ...options, shouldRetry: () => true })).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('bad request'));
    await expect(retry(fn, { ...options, shouldRetry: () => false })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('waits between attempts', async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await retry(fn, { ...options, sleep, random: () => 1, shouldRetry: () => true }).catch(
      () => {},
    );
    expect(sleep.mock.calls).toEqual([[10], [20]]);
  });
});
