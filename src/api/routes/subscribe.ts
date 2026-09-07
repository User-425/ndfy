import type { FastifyPluginAsync } from 'fastify';
import type { MessageService } from '../../domain/message-service.js';
import type { AuthService } from '../../domain/auth-service.js';
import type { MemoryRateLimiter } from '../../security/rate-limiter.js';
import { validateTopic } from '../../security/topic-validator.js';
import { parseSubscriptionQuery } from '../../compatibility/ntfy-query.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { createRateLimitMiddleware } from '../middleware/rate-limit.js';
import { JsonStreamSubscriber } from '../../realtime/json-transport.js';
import { SseSubscriber } from '../../realtime/sse-transport.js';
import { RawStreamSubscriber } from '../../realtime/raw-transport.js';
import { WebSocketSubscriber } from '../../realtime/ws-transport.js';

export interface SubscribeRouteOptions {
  messageService: MessageService;
  authService: AuthService;
  rateLimiter: MemoryRateLimiter;
  keepaliveIntervalSeconds: number;
}

export const subscribeRoutes: FastifyPluginAsync<SubscribeRouteOptions> = async (fastify, opts) => {
  const { messageService, authService, rateLimiter, keepaliveIntervalSeconds } = opts;

  const authHook = createAuthMiddleware(authService);
  const rateLimitHook = createRateLimitMiddleware(rateLimiter);

  // GET /:topic/auth - Auth check endpoint used by ntfy web app and mobile client
  fastify.get(
    '/:topic/auth',
    { preHandler: [authHook, rateLimitHook] },
    async (_request, reply) => {
      reply.status(200).send({ success: true });
    }
  );

  // GET /v1/auth & GET /auth
  fastify.get(
    '/v1/auth',
    { preHandler: [authHook, rateLimitHook] },
    async (_request, reply) => {
      reply.status(200).send({ success: true });
    }
  );

  fastify.get(
    '/auth',
    { preHandler: [authHook, rateLimitHook] },
    async (_request, reply) => {
      reply.status(200).send({ success: true });
    }
  );

  // Common handler for streaming subscriptions
  const handleStreaming = (
    type: 'json' | 'sse' | 'raw',
    request: any,
    reply: any
  ) => {
    const rawTopic = request.params.topic;
    const topic = validateTopic(rawTopic);
    const query = parseSubscriptionQuery(request.query as Record<string, string | undefined>);

    const broker = messageService.getBroker();
    const rawRes = reply.raw;

    // Create appropriate transport subscriber
    let subscriber: JsonStreamSubscriber | SseSubscriber | RawStreamSubscriber;

    if (type === 'json') {
      subscriber = new JsonStreamSubscriber(
        topic,
        rawRes,
        query.poll ? 0 : keepaliveIntervalSeconds,
        () => broker.unsubscribe(topic, subscriber)
      );
    } else if (type === 'sse') {
      subscriber = new SseSubscriber(
        topic,
        rawRes,
        query.poll ? 0 : keepaliveIntervalSeconds,
        () => broker.unsubscribe(topic, subscriber)
      );
    } else {
      subscriber = new RawStreamSubscriber(
        topic,
        rawRes,
        query.poll ? 0 : keepaliveIntervalSeconds,
        () => broker.unsubscribe(topic, subscriber)
      );
    }

    // If query has since or poll=1, replay cached messages
    if (query.since || query.poll || query.id || query.tags || query.priority) {
      const cachedMessages = messageService.queryCachedMessages(topic, {
        since: query.since,
        id: query.id,
        tags: query.tags,
        priority: query.priority,
        scheduled: query.scheduled,
      });

      for (const msg of cachedMessages) {
        subscriber.send(msg);
      }
    }

    // If poll mode requested, close immediately after sending cached messages
    if (query.poll) {
      subscriber.close();
      return;
    }

    // Otherwise, subscribe to real-time events
    broker.subscribe(topic, subscriber);
  };

  // GET /:topic (Default subscription endpoint with content negotiation)
  fastify.get(
    '/:topic',
    { preHandler: [authHook, rateLimitHook] },
    (request: any, reply: any) => {
      const accept = String(request.headers?.accept || '').toLowerCase();
      const format = String(request.query?.format || request.query?.f || '').toLowerCase();

      let transport: 'json' | 'sse' | 'raw' = 'json';

      if (format === 'sse' || format === 'event-stream' || accept.includes('text/event-stream')) {
        transport = 'sse';
      } else if (format === 'raw' || format === 'text' || format === 'plain' || accept.includes('text/plain')) {
        transport = 'raw';
      } else if (
        format === 'json' ||
        format === 'ndjson' ||
        accept.includes('application/json') ||
        accept.includes('application/x-ndjson')
      ) {
        transport = 'json';
      } else {
        transport = 'json';
      }

      return handleStreaming(transport, request, reply);
    }
  );

  // GET /:topic/json
  fastify.get(
    '/:topic/json',
    { preHandler: [authHook, rateLimitHook] },
    (request, reply) => handleStreaming('json', request, reply)
  );

  // GET /:topic/sse
  fastify.get(
    '/:topic/sse',
    { preHandler: [authHook, rateLimitHook] },
    (request, reply) => handleStreaming('sse', request, reply)
  );

  // GET /:topic/raw
  fastify.get(
    '/:topic/raw',
    { preHandler: [authHook, rateLimitHook] },
    (request, reply) => handleStreaming('raw', request, reply)
  );

  // GET /:topic/ws (WebSocket)
  fastify.get(
    '/:topic/ws',
    { websocket: true, preHandler: [authHook, rateLimitHook] },
    (connection: any, request: any) => {
      // In @fastify/websocket v11, connection is { socket, ... }
      const socket = connection.socket || connection;
      const rawTopic = request.params.topic;
      const topic = validateTopic(rawTopic);
      const query = parseSubscriptionQuery(request.query as Record<string, string | undefined>);

      const broker = messageService.getBroker();

      const subscriber = new WebSocketSubscriber(
        topic,
        socket,
        query.poll ? 0 : keepaliveIntervalSeconds,
        () => broker.unsubscribe(topic, subscriber)
      );

      // Replay cached messages if requested
      if (query.since || query.poll || query.id || query.tags || query.priority) {
        const cachedMessages = messageService.queryCachedMessages(topic, {
          since: query.since,
          id: query.id,
          tags: query.tags,
          priority: query.priority,
          scheduled: query.scheduled,
        });

        for (const msg of cachedMessages) {
          subscriber.send(msg);
        }
      }

      if (query.poll) {
        subscriber.close();
        return;
      }

      broker.subscribe(topic, subscriber);
    }
  );
};
