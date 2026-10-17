import { SignJWT, generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPricingApp } from '../../src/services/pricing/app.js';
import { AUDIENCE, ISSUER, authFor, fetchToken, startAuthServer } from '../helpers/auth.js';

let auth: Awaited<ReturnType<typeof startAuthServer>>;

beforeAll(async () => {
  auth = await startAuthServer();
});
afterAll(async () => {
  await auth.app.close();
});

describe('auth server (client credentials)', () => {
  it('issues a JWT with Basic credentials', async () => {
    const { status, body } = await fetchToken(auth.url, 'commerce-bff', 'bff-secret');
    expect(status).toBe(200);
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 300 });
    expect(body.scope).toBe('catalog:read pricing:read inventory:read');
    expect(body.access_token?.split('.')).toHaveLength(3);
  });

  it('accepts credentials in the form body too', async () => {
    const res = await auth.app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'grant_type=client_credentials&client_id=commerce-bff&client_secret=bff-secret',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('rejects a wrong secret with invalid_client', async () => {
    const { status, body } = await fetchToken(auth.url, 'commerce-bff', 'nope');
    expect(status).toBe(401);
    expect(body.error).toBe('invalid_client');
  });

  it('rejects scopes the client is not allowed to request', async () => {
    const { status, body } = await fetchToken(
      auth.url,
      'commerce-bff',
      'bff-secret',
      'pricing:write',
    );
    expect(status).toBe(400);
    expect(body.error).toBe('invalid_scope');
  });

  it('rejects other grant types', async () => {
    const res = await auth.app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'grant_type=password',
    });
    expect(res.json().error).toBe('unsupported_grant_type');
  });
});

describe('services protected by JWT', () => {
  const pricing = () => buildPricingApp({ logger: false, auth: authFor(auth.jwksUrl, 'pricing') });

  it('returns 401 without a token', async () => {
    const res = await pricing().inject('/prices/SL-1001');
    expect(res.statusCode).toBe(401);
  });

  it('accepts a valid token', async () => {
    const { body } = await fetchToken(auth.url, 'commerce-bff', 'bff-secret');
    const res = await pricing().inject({
      url: '/prices/SL-1001',
      headers: { authorization: `Bearer ${body.access_token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 for a token signed by someone else', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ scope: 'pricing:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'forged' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);
    const res = await pricing().inject({
      url: '/prices/SL-1001',
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when the token lacks the write scope', async () => {
    const { body } = await fetchToken(auth.url, 'commerce-bff', 'bff-secret');
    const res = await pricing().inject({
      method: 'PUT',
      url: '/prices/SL-1001',
      headers: { authorization: `Bearer ${body.access_token}` },
      payload: { basePriceCents: 1 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lets the back-office write prices', async () => {
    const { body } = await fetchToken(auth.url, 'backoffice', 'backoffice-secret', 'pricing:write');
    const res = await pricing().inject({
      method: 'PUT',
      url: '/prices/SL-1001',
      headers: { authorization: `Bearer ${body.access_token}` },
      payload: { basePriceCents: 1_000 },
    });
    expect(res.statusCode).toBe(200);
  });
});
