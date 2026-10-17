import type { FastifyInstance } from 'fastify';

/** Starts a Fastify app and closes it cleanly on SIGINT/SIGTERM (docker stop). */
export async function startServer(app: FastifyInstance, port: number, host = '0.0.0.0') {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down');
      void app.close().then(() => process.exit(0));
    });
  }

  try {
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
