import { envString } from '../../shared/env.js';

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  /** Scopes this client is allowed to request. */
  allowedScopes: string[];
}

/**
 * Registered machine-to-machine clients. In a real system this would live in
 * a database / the identity provider; secrets come from the environment.
 */
export function clientsFromEnv(): OAuthClient[] {
  return [
    {
      clientId: envString('BFF_CLIENT_ID', 'commerce-bff'),
      clientSecret: envString('BFF_CLIENT_SECRET', 'dev-bff-secret'),
      allowedScopes: ['catalog:read', 'pricing:read', 'inventory:read'],
    },
    {
      // Used by scripts/tests to simulate a back-office updating prices & stock.
      clientId: envString('BACKOFFICE_CLIENT_ID', 'backoffice'),
      clientSecret: envString('BACKOFFICE_CLIENT_SECRET', 'dev-backoffice-secret'),
      allowedScopes: [
        'catalog:read',
        'pricing:read',
        'pricing:write',
        'inventory:read',
        'inventory:write',
      ],
    },
  ];
}
