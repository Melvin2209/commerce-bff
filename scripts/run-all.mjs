// Starts the 5 processes locally without Docker (Redis must be running).
//   node scripts/run-all.mjs          -> runs the TypeScript sources with tsx
//   node scripts/run-all.mjs --dist   -> runs the compiled build (npm run build first)
import { spawn } from 'node:child_process';

const useDist = process.argv.includes('--dist');
const entry = (path) =>
  useDist ? ['node', [`dist/${path}.js`]] : ['npx', ['tsx', `src/${path}.ts`]];

const shared = {
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  AUTH_ISSUER: 'http://localhost:4000',
  AUTH_JWKS_URL: 'http://localhost:4000/.well-known/jwks.json',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
};

const processes = [
  { name: 'auth', path: 'services/auth/main', env: { PORT: '4000' } },
  { name: 'catalog', path: 'services/catalog/main', env: { PORT: '4001' } },
  { name: 'pricing', path: 'services/pricing/main', env: { PORT: '4002' } },
  { name: 'inventory', path: 'services/inventory/main', env: { PORT: '4003' } },
  {
    name: 'bff',
    path: 'bff/main',
    env: {
      PORT: '3000',
      AUTH_TOKEN_URL: 'http://localhost:4000/oauth/token',
      CATALOG_URL: 'http://localhost:4001',
      PRICING_URL: 'http://localhost:4002',
      INVENTORY_URL: 'http://localhost:4003',
    },
  },
];

const children = processes.map(({ name, path, env }) => {
  const [cmd, args] = entry(path);
  const child = spawn(cmd, args, {
    env: { ...process.env, ...shared, ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('exit', (code) => console.error(`[${name}] exited with code ${code}`));
  return child;
});

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
