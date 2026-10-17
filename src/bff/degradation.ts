import type { FastifyBaseLogger, FastifyReply } from 'fastify';
import { UpstreamError } from './clients/errors.js';

/**
 * Collects which optional services failed while building one response.
 *
 * Instead of failing the whole page when e.g. inventory is down, we answer
 * with what we have, list the missing parts in `degraded` and set the
 * `x-degraded` header so the front can show a hint and monitoring can count it.
 */
export class Degradation {
  private readonly failed = new Set<string>();

  constructor(private readonly log: FastifyBaseLogger) {}

  /** Resolves to undefined (instead of throwing) if the upstream call fails. */
  async optional<T>(service: string, call: Promise<T>): Promise<T | undefined> {
    try {
      return await call;
    } catch (error) {
      if (!(error instanceof UpstreamError)) throw error;
      this.log.warn({ service, kind: error.kind, err: error.message }, 'degraded response');
      this.failed.add(service);
      return undefined;
    }
  }

  get services(): string[] {
    return [...this.failed].sort();
  }

  applyHeader(reply: FastifyReply) {
    if (this.failed.size > 0) reply.header('x-degraded', this.services.join(','));
  }
}
