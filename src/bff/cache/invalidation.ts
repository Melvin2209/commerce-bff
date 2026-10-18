import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import { CHANGE_CHANNEL, type ChangeEvent } from '../../shared/events.js';
import type { CacheKind, ItemCache } from './cache.js';

const KIND_BY_EVENT: Record<ChangeEvent['type'], CacheKind> = {
  'product.updated': 'product',
  'price.updated': 'price',
  'stock.updated': 'stock',
};

/**
 * Listens to change events published by the services and deletes the matching
 * cache key, so a new price is visible immediately instead of after the TTL.
 *
 * Needs its own Redis connection: a connection in subscriber mode cannot run
 * normal commands. If an event is missed (BFF restarting...), the TTL still
 * bounds how long stale data can live: that is why we keep both mechanisms.
 */
export async function subscribeToInvalidations(
  subscriber: Redis,
  cache: ItemCache,
  log: FastifyBaseLogger,
) {
  subscriber.on('message', (_channel: string, message: string) => {
    let event: ChangeEvent;
    try {
      event = JSON.parse(message) as ChangeEvent;
    } catch {
      log.warn({ message }, 'ignoring malformed change event');
      return;
    }
    const kind = KIND_BY_EVENT[event.type];
    if (!kind) return;
    cache
      .invalidate(kind, event.sku)
      .then(() => log.info({ event }, 'cache invalidated'))
      .catch((error: Error) => log.warn({ err: error.message, event }, 'invalidation failed'));
  });
  await subscriber.subscribe(CHANGE_CHANNEL);
}
