import { randomUUID, timingSafeEqual } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { Type } from 'typebox';
import { createBaseApp } from '../../shared/http-app.js';
import type { OAuthClient } from './clients.js';

export interface AuthServerOptions {
  logger?: boolean;
  issuer: string;
  audience: string;
  clients: OAuthClient[];
  tokenTtlSeconds: number;
}

const TokenRequest = Type.Object({
  grant_type: Type.String(),
  scope: Type.Optional(Type.String()),
  client_id: Type.Optional(Type.String()),
  client_secret: Type.Optional(Type.String()),
});

/** OAuth2 error response, see RFC 6749 §5.2. */
const oauthError = (error: string, description: string) => ({
  error,
  error_description: description,
});

/** Compares secrets in constant time so response timing does not leak them. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Credentials can be sent with HTTP Basic auth (recommended by the RFC) or in
 * the form body. We support both.
 */
function readClientCredentials(
  authorization: string | undefined,
  body: { client_id?: string; client_secret?: string },
) {
  if (authorization?.startsWith('Basic ')) {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator)),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  }
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

/**
 * Minimal OAuth2 authorization server supporting only the client credentials
 * grant (service-to-service). Tokens are JWTs signed with an RSA key generated
 * at startup; services verify them with the public key exposed as a JWKS.
 */
export async function buildAuthApp(options: AuthServerOptions) {
  const app = createBaseApp('auth', options);

  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const kid = randomUUID();
  const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };

  // The token endpoint expects application/x-www-form-urlencoded (RFC 6749 §4.4.2).
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );

  app.get('/.well-known/jwks.json', async () => ({ keys: [publicJwk] }));

  app.post('/oauth/token', { schema: { body: TokenRequest } }, async (request, reply) => {
    // Tokens must never be cached by intermediaries (RFC 6749 §5.1).
    reply.header('cache-control', 'no-store');

    if (request.body.grant_type !== 'client_credentials') {
      return reply
        .code(400)
        .send(oauthError('unsupported_grant_type', 'Only client_credentials is supported'));
    }

    const { clientId, clientSecret } = readClientCredentials(
      request.headers.authorization,
      request.body,
    );
    const client = options.clients.find((c) => c.clientId === clientId);
    if (!client || !clientSecret || !safeEqual(client.clientSecret, clientSecret)) {
      request.log.warn({ clientId }, 'invalid client credentials');
      return reply.code(401).send(oauthError('invalid_client', 'Client authentication failed'));
    }

    // No scope requested => grant everything the client is allowed to have.
    const requested = request.body.scope?.split(' ').filter(Boolean) ?? client.allowedScopes;
    const forbidden = requested.filter((scope) => !client.allowedScopes.includes(scope));
    if (forbidden.length > 0) {
      return reply
        .code(400)
        .send(oauthError('invalid_scope', `Scope not allowed: ${forbidden.join(' ')}`));
    }

    const scope = requested.join(' ');
    const accessToken = await new SignJWT({ scope })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(options.issuer)
      .setAudience(options.audience)
      .setSubject(client.clientId)
      .setIssuedAt()
      .setExpirationTime(`${options.tokenTtlSeconds}s`)
      .setJti(randomUUID())
      .sign(privateKey);

    request.log.info({ clientId, scope }, 'access token issued');
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: options.tokenTtlSeconds,
      scope,
    };
  });

  return app;
}
