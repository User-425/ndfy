import type { FastifyPluginAsync } from 'fastify';
import type { MessageService } from '../../domain/message-service.js';
import type { AuthService } from '../../domain/auth-service.js';
import type { MemoryRateLimiter } from '../../security/rate-limiter.js';
import { validateTopicList } from '../../security/topic-validator.js';
import { parseSubscriptionQuery } from '../../compatibility/ntfy-query.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { createRateLimitMiddleware } from '../middleware/rate-limit.js';
import { JsonStreamSubscriber } from '../../realtime/json-transport.js';
import { SseSubscriber } from '../../realtime/sse-transport.js';
import { RawStreamSubscriber } from '../../realtime/raw-transport.js';
import { WebSocketSubscriber } from '../../realtime/ws-transport.js';
import type { NtfyMessage } from '../../domain/models.js';

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

  // Common handler for streaming subscriptions (supports single and comma-separated multiple topics)
  const handleStreaming = (
    type: 'json' | 'sse' | 'raw',
    request: any,
    reply: any
  ) => {
    const rawTopic = request.params?.topic || request.query?.topic || request.query?.topics;
    const topics = validateTopicList(rawTopic);
    const query = parseSubscriptionQuery(request.query as Record<string, string | undefined>);

    const broker = messageService.getBroker();
    if (typeof reply.hijack === 'function') {
      reply.hijack();
    }
    const rawRes = reply.raw;
    const topicString = topics.join(',');

    const unsubscribeAll = () => {
      for (const t of topics) {
        broker.unsubscribe(t, subscriber);
      }
    };

    // Create appropriate transport subscriber
    let subscriber: JsonStreamSubscriber | SseSubscriber | RawStreamSubscriber;

    if (type === 'json') {
      subscriber = new JsonStreamSubscriber(
        topicString,
        rawRes,
        query.poll ? 0 : keepaliveIntervalSeconds,
        unsubscribeAll
      );
    } else if (type === 'sse') {
      subscriber = new SseSubscriber(
        topicString,
        rawRes,
        query.poll ? 0 : keepaliveIntervalSeconds,
        unsubscribeAll
      );
    } else {
      subscriber = new RawStreamSubscriber(
        topicString,
        rawRes,
        query.poll ? 0 : keepaliveIntervalSeconds,
        unsubscribeAll
      );
    }

    // If query has since or poll=1, replay cached messages across all subscribed topics
    if (query.since || query.poll || query.id || query.tags || query.priority) {
      const allCached: NtfyMessage[] = [];
      for (const t of topics) {
        const cachedMessages = messageService.queryCachedMessages(t, {
          since: query.since,
          id: query.id,
          tags: query.tags,
          priority: query.priority,
          scheduled: query.scheduled,
        });
        allCached.push(...cachedMessages);
      }

      // Sort replayed messages by time ascending (ntfy spec)
      allCached.sort((a, b) => a.time - b.time);

      for (const msg of allCached) {
        subscriber.send(msg);
      }
    }

    // If poll mode requested, close immediately after sending cached messages
    if (query.poll) {
      subscriber.close();
      return;
    }

    // Otherwise, subscribe to real-time events for all topics
    for (const t of topics) {
      broker.subscribe(t, subscriber);
    }
  };

  // WebSocket handler (supports single and comma-separated multiple topics)
  const handleWebSocket = (connection: any, request: any) => {
    const socket = connection.socket || connection;
    const rawTopic = request.params?.topic || request.query?.topic || request.query?.topics;
    const topics = validateTopicList(rawTopic);
    const query = parseSubscriptionQuery(request.query as Record<string, string | undefined>);

    const broker = messageService.getBroker();
    const topicString = topics.join(',');

    const unsubscribeAll = () => {
      for (const t of topics) {
        broker.unsubscribe(t, subscriber);
      }
    };

    const subscriber = new WebSocketSubscriber(
      topicString,
      socket,
      query.poll ? 0 : keepaliveIntervalSeconds,
      unsubscribeAll
    );

    // Replay cached messages if requested
    if (query.since || query.poll || query.id || query.tags || query.priority) {
      const allCached: NtfyMessage[] = [];
      for (const t of topics) {
        const cachedMessages = messageService.queryCachedMessages(t, {
          since: query.since,
          id: query.id,
          tags: query.tags,
          priority: query.priority,
          scheduled: query.scheduled,
        });
        allCached.push(...cachedMessages);
      }

      allCached.sort((a, b) => a.time - b.time);

      for (const msg of allCached) {
        subscriber.send(msg);
      }
    }

    if (query.poll) {
      subscriber.close();
      return;
    }

    for (const t of topics) {
      broker.subscribe(t, subscriber);
    }
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
    handleWebSocket
  );

  // Standalone query-based endpoints (e.g. GET /json?topics=..., GET /sse?topics=..., GET /ws?topics=...)
  fastify.get('/json', { preHandler: [authHook, rateLimitHook] }, (request, reply) => handleStreaming('json', request, reply));
  fastify.get('/sse', { preHandler: [authHook, rateLimitHook] }, (request, reply) => handleStreaming('sse', request, reply));
  fastify.get('/raw', { preHandler: [authHook, rateLimitHook] }, (request, reply) => handleStreaming('raw', request, reply));
  fastify.get('/topics', { preHandler: [authHook, rateLimitHook] }, (request, reply) => handleStreaming('json', request, reply));
  fastify.get('/ws', { websocket: true, preHandler: [authHook, rateLimitHook] }, handleWebSocket);
};
