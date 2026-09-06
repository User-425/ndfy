import type { FastifyPluginAsync } from 'fastify';
import type { MessageService } from '../../domain/message-service.js';
import type { AuthService } from '../../domain/auth-service.js';
import type { MemoryRateLimiter } from '../../security/rate-limiter.js';
import { parsePublishHeaders } from '../../compatibility/ntfy-headers.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { createRateLimitMiddleware } from '../middleware/rate-limit.js';
import { createBadRequestError } from '../../compatibility/ntfy-errors.js';
import type { PublishParams } from '../../domain/models.js';

export interface PublishRouteOptions {
  messageService: MessageService;
  authService: AuthService;
  rateLimiter: MemoryRateLimiter;
}

export const publishRoutes: FastifyPluginAsync<PublishRouteOptions> = async (fastify, opts) => {
  const { messageService, authService, rateLimiter } = opts;

  const authHook = createAuthMiddleware(authService);
  const rateLimitHook = createRateLimitMiddleware(rateLimiter);

  // POST /:topic and PUT /:topic
  const handleTopicPublish = async (request: any, reply: any) => {
    const topic = request.params.topic;
    if (!topic) {
      throw createBadRequestError('Topic is required');
    }

    const headers = parsePublishHeaders(request.headers);
    let messageBody = '';

    if (typeof request.body === 'string') {
      messageBody = request.body;
    } else if (request.body && typeof request.body === 'object') {
      // If JSON body was sent to /:topic
      if (typeof request.body.message === 'string') {
        messageBody = request.body.message;
      } else {
        messageBody = JSON.stringify(request.body);
      }
    }

    const params: PublishParams = {
      topic,
      message: messageBody,
      title: headers.title,
      priority: headers.priority,
      tags: headers.tags,
      click: headers.click,
      icon: headers.icon,
      actions: headers.actions,
      delay: headers.delay,
      cache: headers.cache,
      pollId: headers.pollId,
    };

    // If body is JSON, allow JSON properties to supplement/override headers
    if (request.body && typeof request.body === 'object') {
      if (request.body.title) params.title = request.body.title;
      if (request.body.priority !== undefined) params.priority = request.body.priority;
      if (request.body.tags) params.tags = request.body.tags;
      if (request.body.click) params.click = request.body.click;
      if (request.body.icon) params.icon = request.body.icon;
      if (request.body.actions) params.actions = request.body.actions;
      if (request.body.delay) params.delay = request.body.delay;
      if (request.body.cache !== undefined) params.cache = request.body.cache;
      if (request.body.poll_id) params.pollId = request.body.poll_id;
    }

    const published = await messageService.publish(params);
    reply.status(200).send(published);
  };

  fastify.post('/:topic', { preHandler: [authHook, rateLimitHook] }, handleTopicPublish);
  fastify.put('/:topic', { preHandler: [authHook, rateLimitHook] }, handleTopicPublish);

  // POST / and PUT / (Root JSON publishing)
  const handleRootPublish = async (request: any, reply: any) => {
    if (!request.body || typeof request.body !== 'object') {
      throw createBadRequestError('JSON object required for root publishing');
    }

    const topic = request.body.topic;
    if (!topic || typeof topic !== 'string') {
      throw createBadRequestError('Field "topic" is required in JSON payload');
    }

    const headers = parsePublishHeaders(request.headers);

    const params: PublishParams = {
      topic,
      message: typeof request.body.message === 'string' ? request.body.message : '',
      title: request.body.title || headers.title,
      priority: request.body.priority !== undefined ? request.body.priority : headers.priority,
      tags: request.body.tags || headers.tags,
      click: request.body.click || headers.click,
      icon: request.body.icon || headers.icon,
      actions: request.body.actions || headers.actions,
      delay: request.body.delay || headers.delay,
      cache: request.body.cache !== undefined ? request.body.cache : headers.cache,
      pollId: request.body.poll_id || headers.pollId,
    };

    const published = await messageService.publish(params);
    reply.status(200).send(published);
  };

  fastify.post('/', { preHandler: [authHook, rateLimitHook] }, handleRootPublish);
  fastify.put('/', { preHandler: [authHook, rateLimitHook] }, handleRootPublish);
};
