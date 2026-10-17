import { chaosFromEnv } from '../../shared/chaos.js';
import { envNumber } from '../../shared/env.js';
import { jwtAuthFromEnv } from '../../shared/jwt-auth.js';
import { startServer } from '../../shared/server.js';
import { buildPricingApp } from './app.js';

const app = buildPricingApp({ chaos: chaosFromEnv(), auth: jwtAuthFromEnv('pricing') });
await startServer(app, envNumber('PORT', 4002));
