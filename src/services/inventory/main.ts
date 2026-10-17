import { chaosFromEnv } from '../../shared/chaos.js';
import { envNumber } from '../../shared/env.js';
import { jwtAuthFromEnv } from '../../shared/jwt-auth.js';
import { startServer } from '../../shared/server.js';
import { buildInventoryApp } from './app.js';

const app = buildInventoryApp({ chaos: chaosFromEnv(), auth: jwtAuthFromEnv('inventory') });
await startServer(app, envNumber('PORT', 4003));
