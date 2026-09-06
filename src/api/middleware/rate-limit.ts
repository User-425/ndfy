import type { FastifyRequest, FastifyReply } from 'fastify';
import type { MemoryRateLimiter } from '../../security/rate-limiter.js';
import { createRateLimitError } from '../../compatibility/ntfy-errors.js';

export function createRateLimitMiddleware(limiter: MemoryRateLimiter) {
  return async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const key = request.ip || '127.0.0.1';
    const result = limiter.check(key);

    if (!result.allowed) {
      const err = createRateLimitError();
      reply.header('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000));
      reply.status(err.httpStatus).send(err.toJSON());
    }
  };
}
