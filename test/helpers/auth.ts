import type { AddressInfo } from 'node:net';
import { buildAuthApp } from '../../src/services/auth/app.js';
import type { OAuthClient } from '../../src/services/auth/clients.js';

export const ISSUER = 'http://auth.test';
export const AUDIENCE = 'shoplab-services';

export const TEST_CLIENTS: OAuthClient[] = [
  {
    clientId: 'commerce-bff',
    clientSecret: 'bff-secret',
    allowedScopes: ['catalog:read', 'pricing:read', 'inventory:read'],
  },
  {
    clientId: 'backoffice',
    clientSecret: 'backoffice-secret',
    allowedScopes: ['catalog:read', 'pricing:read', 'pricing:write', 'inventory:write'],
  },
];

/** Starts a real auth server on a random port (services need to reach its JWKS). */
export async function startAuthServer(tokenTtlSeconds = 300) {
  const app = await buildAuthApp({
    logger: false,
    issuer: ISSUER,
    audience: AUDIENCE,
    clients: TEST_CLIENTS,
    tokenTtlSeconds,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  return { app, url, jwksUrl: `${url}/.well-known/jwks.json` };
}

export async function fetchToken(
  authUrl: string,
  clientId: string,
  secret: string,
  scope?: string,
) {
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  if (scope) body.set('scope', scope);
  const res = await fetch(`${authUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
    },
    body,
  });
  return { status: res.status, body: (await res.json()) as Record<string, string> };
}

export const authFor = (jwksUrl: string, service: string) => ({
  issuer: ISSUER,
  audience: AUDIENCE,
  jwksUrl,
  readScope: `${service}:read`,
  writeScope: `${service}:write`,
});
