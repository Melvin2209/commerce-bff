import { Type } from 'typebox';
import type { ChaosConfig } from '../shared/chaos.js';
import type { ChangePublisher } from '../shared/events.js';

export interface ServiceOptions {
  logger?: boolean;
  chaos?: ChaosConfig;
  /** Called after a write so subscribers (the BFF cache) can be notified. */
  publish?: ChangePublisher;
}

export const SkuParams = Type.Object({ sku: Type.String({ pattern: '^SL-[0-9]{4}$' }) });

/** Batch endpoints take a comma-separated list: ?skus=SL-1001,SL-1002 */
export const SkusQuery = Type.Object({
  skus: Type.String({ minLength: 1, maxLength: 2000 }),
});

export function parseSkus(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

export const ErrorBody = Type.Object({ error: Type.String(), message: Type.String() });

export const notFound = (sku: string) => ({ error: 'NotFound', message: `Unknown SKU ${sku}` });
