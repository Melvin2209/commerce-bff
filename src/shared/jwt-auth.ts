import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { App } from './http-app.js';

export interface JwtAuthOptions {
  issuer: string;
  audience: string;
  /** Where to fetch the public keys. jose caches them and refetches on unknown "kid". */
  jwksUrl?: string;
  /** Alternative to jwksUrl, useful in tests. */
  keys?: JWTVerifyGetKey;
  /** Scope required for GET requests, e.g. "pricing:read". */
  readScope: string;
  /** Scope required for any other method, e.g. "pricing:write". */
  writeScope: string;
}

const PUBLIC_PATHS = ['/health', '/__chaos'];

/**
 * Protects every route of a service with a Bearer JWT:
 * - 401 when the token is missing, expired, badly signed or for another audience
 * - 403 when the token is valid but lacks the scope needed for this method
 */
export function registerJwtAuth(app: App, options: JwtAuthOptions) {
  const keys = options.keys ?? createRemoteJWKSet(new URL(options.jwksUrl ?? ''));

  app.addHook('onRequest', async (request, reply) => {
    if (PUBLIC_PATHS.some((path) => request.url.startsWith(path))) return;

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply
        .code(401)
        .header('www-authenticate', 'Bearer')
        .send({ error: 'Unauthorized', message: 'Missing bearer token' });
    }

    let scopes: string[];
    try {
      const { payload } = await jwtVerify(header.slice(7), keys, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ['RS256'],
      });
      scopes = typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
      request.log.debug({ clientId: payload.sub }, 'token verified');
    } catch (err) {
      request.log.warn({ reason: (err as Error).message }, 'invalid token');
      return reply
        .code(401)
        .header('www-authenticate', 'Bearer error="invalid_token"')
        .send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }

    const required = request.method === 'GET' ? options.readScope : options.writeScope;
    if (!scopes.includes(required)) {
      return reply
        .code(403)
        .header('www-authenticate', `Bearer error="insufficient_scope" scope="${required}"`)
        .send({ error: 'Forbidden', message: `Missing scope ${required}` });
    }
  });
}

/** Reads the verifier settings shared by all services from the environment. */
export function jwtAuthFromEnv(service: string) {
  return {
    issuer: process.env.AUTH_ISSUER ?? 'http://auth:4000',
    audience: process.env.AUTH_AUDIENCE ?? 'shoplab-services',
    jwksUrl: process.env.AUTH_JWKS_URL ?? 'http://auth:4000/.well-known/jwks.json',
    readScope: `${service}:read`,
    writeScope: `${service}:write`,
  };
}
