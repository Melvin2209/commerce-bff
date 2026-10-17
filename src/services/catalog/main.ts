import { chaosFromEnv } from '../../shared/chaos.js';
import { envNumber } from '../../shared/env.js';
import { startServer } from '../../shared/server.js';
import { buildCatalogApp } from './app.js';

const app = buildCatalogApp({ chaos: chaosFromEnv() });
await startServer(app, envNumber('PORT', 4001));
