import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService } from '../../domain/auth-service.js';
import { createUnauthorizedError } from '../../compatibility/ntfy-errors.js';

export function createAuthMiddleware(authService: AuthService) {
  return async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (authService.getMode() === 'none') {
      return;
    }

    // Try Authorization header first
    const authHeader = request.headers['authorization'];
    if (authHeader && authService.isAuthorized(authHeader)) {
      return;
    }

    // Try query param `?auth=`
    const query = request.query as Record<string, string | undefined>;
    const authQuery = query?.auth;
    if (authQuery && authService.isAuthorized(authQuery)) {
      return;
    }

    const err = createUnauthorizedError();
    reply.status(err.httpStatus).send(err.toJSON());
  };
}
