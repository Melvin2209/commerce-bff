import { chaosFromEnv } from '../../shared/chaos.js';
import { envNumber } from '../../shared/env.js';
import { startServer } from '../../shared/server.js';
import { buildInventoryApp } from './app.js';

const app = buildInventoryApp({ chaos: chaosFromEnv() });
await startServer(app, envNumber('PORT', 4003));
