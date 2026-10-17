import { startServer } from '../shared/server.js';
import { buildBffApp } from './app.js';
import { configFromEnv } from './config.js';

const config = configFromEnv();
const app = await buildBffApp(config);
await startServer(app, config.port);
