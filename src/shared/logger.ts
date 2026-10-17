import type { FastifyServerOptions } from 'fastify';
import { envBoolean, envString } from './env.js';

/**
 * Pino options shared by every process. Logs are JSON by default (easy to ship
 * to a log pipeline). Set LOG_PRETTY=true for human-friendly local output.
 */
export function loggerOptions(service: string): FastifyServerOptions['logger'] {
  return {
    level: envString('LOG_LEVEL', 'info'),
    base: { service },
    // Never write bearer tokens or client secrets to the logs.
    redact: {
      paths: ['req.headers.authorization', 'client_secret', '*.client_secret'],
      censor: '[REDACTED]',
    },
    ...(envBoolean('LOG_PRETTY', false) && {
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l' } },
    }),
  };
}
