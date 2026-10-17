import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { randomUUID } from 'node:crypto';
import { loggerOptions } from './logger.js';

export interface BaseAppOptions {
  /** Set to false in tests to keep the output quiet. */
  logger?: boolean;
}

/**
 * Creates a Fastify instance with the conventions shared by every process:
 * structured logs, request-id propagation and a /health endpoint.
 */
export function createBaseApp(service: string, options: BaseAppOptions = {}) {
  const app = Fastify({
    logger: options.logger === false ? false : loggerOptions(service),
    // Reuse the caller's x-request-id so one user request can be followed
    // across the BFF and every downstream service in the logs.
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    disableRequestLogging: false,
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.get('/health', async () => ({ status: 'ok', service }));

  return app;
}

export type App = ReturnType<typeof createBaseApp>;
