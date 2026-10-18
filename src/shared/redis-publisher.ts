import { Redis } from 'ioredis';
import { CHANGE_CHANNEL, type ChangePublisher } from './events.js';

/** Publishes change events on Redis pub/sub (fire-and-forget: a lost event only means waiting for the TTL). */
export function redisPublisher(url: string | undefined): ChangePublisher | undefined {
  if (!url) return undefined;
  const redis = new Redis(url, { maxRetriesPerRequest: 1 });
  redis.on('error', () => {}); // logged by the caller's request; don't crash the service
  return async (event) => {
    await redis.publish(CHANGE_CHANNEL, JSON.stringify(event)).catch(() => 0);
  };
}
