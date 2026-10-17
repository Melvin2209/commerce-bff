import { afterEach, describe, expect, it } from 'vitest';
import { envBoolean, envNumber, envString } from '../../src/shared/env.js';

describe('env helpers', () => {
  afterEach(() => {
    delete process.env.TEST_VAR;
  });

  it('returns the fallback when the variable is not set', () => {
    expect(envString('TEST_VAR', 'default')).toBe('default');
    expect(envNumber('TEST_VAR', 42)).toBe(42);
    expect(envBoolean('TEST_VAR', true)).toBe(true);
  });

  it('parses values from the environment', () => {
    process.env.TEST_VAR = '0.25';
    expect(envNumber('TEST_VAR', 0)).toBe(0.25);
    process.env.TEST_VAR = 'true';
    expect(envBoolean('TEST_VAR', false)).toBe(true);
  });

  it('fails fast on invalid or missing values', () => {
    process.env.TEST_VAR = 'abc';
    expect(() => envNumber('TEST_VAR', 0)).toThrow(/must be a number/);
    delete process.env.TEST_VAR;
    expect(() => envString('TEST_VAR')).toThrow(/Missing/);
  });
});
