import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests start real HTTP servers and talk to Redis: give them some room.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
