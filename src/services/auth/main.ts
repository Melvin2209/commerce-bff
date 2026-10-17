import { envNumber, envString } from '../../shared/env.js';
import { startServer } from '../../shared/server.js';
import { buildAuthApp } from './app.js';
import { clientsFromEnv } from './clients.js';

const app = await buildAuthApp({
  issuer: envString('AUTH_ISSUER', 'http://auth:4000'),
  audience: envString('AUTH_AUDIENCE', 'shoplab-services'),
  clients: clientsFromEnv(),
  tokenTtlSeconds: envNumber('TOKEN_TTL_SECONDS', 300),
});
await startServer(app, envNumber('PORT', 4000));
