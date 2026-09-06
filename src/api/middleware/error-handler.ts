import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { NtfyError, createInternalServerError, createBadRequestError } from '../../compatibility/ntfy-errors.js';
import { InvalidTopicError } from '../../security/topic-validator.js';

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  request.log.error({ err: error }, 'Request error occurred');

  if (error instanceof NtfyError) {
    reply.status(error.httpStatus).send(error.toJSON());
    return;
  }

  if (error instanceof InvalidTopicError) {
    const ntfyErr = createBadRequestError(error.message);
    reply.status(ntfyErr.httpStatus).send(ntfyErr.toJSON());
    return;
  }

  // Fastify validation errors
  if ('validation' in error && error.validation) {
    const ntfyErr = createBadRequestError(error.message);
    reply.status(400).send(ntfyErr.toJSON());
    return;
  }

  // Generic internal server error
  const ntfyErr = createInternalServerError(
    process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
  );
  reply.status(500).send(ntfyErr.toJSON());
}
