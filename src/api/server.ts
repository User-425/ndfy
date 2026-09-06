import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import type { Config } from '../config/config.js';
import type { MessageService } from '../domain/message-service.js';
import type { AuthService } from '../domain/auth-service.js';
import { MemoryRateLimiter } from '../security/rate-limiter.js';
import { errorHandler } from './middleware/error-handler.js';
import { publishRoutes } from './routes/publish.js';
import { subscribeRoutes } from './routes/subscribe.js';
import { healthRoutes } from './routes/health.js';
import type { Logger } from '../utils/logger.js';

export interface AppDependencies {
  config: Config;
  messageService: MessageService;
  authService: AuthService;
  logger: Logger;
}

export function buildServer(deps: AppDependencies) {
  const { config, messageService, authService, logger } = deps;

  const app = Fastify({
    loggerInstance: logger as any,
    trustProxy: config.TRUST_PROXY,
    bodyLimit: config.MESSAGE_SIZE_LIMIT + 1024,
  });

  // Add plain text and fallback body parsers for publishing
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  // Centralized ntfy error handler
  app.setErrorHandler(errorHandler);

  // Rate limiters
  const publishLimiter = new MemoryRateLimiter({
    maxRequests: config.RATE_LIMIT_PUBLISH,
    windowMs: 60_000,
  });

  const subscribeLimiter = new MemoryRateLimiter({
    maxRequests: config.RATE_LIMIT_SUBSCRIBE,
    windowMs: 60_000,
  });

  // Plugins
  app.register(fastifyCors, { origin: true });
  app.register(fastifyWebsocket, {
    options: {
      maxPayload: config.MESSAGE_SIZE_LIMIT + 1024,
    },
  });

  // Group all core routes
  const registerCoreRoutes: FastifyPluginAsync = async (scope) => {
    // Health route
    scope.register(healthRoutes, { messageService });

    // Subscription routes (GET /:topic/json, /sse, /raw, /ws)
    scope.register(subscribeRoutes, {
      messageService,
      authService,
      rateLimiter: subscribeLimiter,
      keepaliveIntervalSeconds: config.KEEPALIVE_INTERVAL,
    });

    // Publishing routes (POST/PUT /:topic, POST/PUT /)
    scope.register(publishRoutes, {
      messageService,
      authService,
      rateLimiter: publishLimiter,
    });
  };

  // Register routes at root
  app.register(registerCoreRoutes);

  // If PUBLIC_BASE_URL has a subpath (e.g. /ntfy), also mount routes with that prefix
  let subpath = '';
  try {
    const parsedUrl = new URL(config.PUBLIC_BASE_URL);
    subpath = parsedUrl.pathname.replace(/\/+$/, '');
  } catch {
    subpath = '';
  }

  if (subpath && subpath !== '/') {
    app.register(registerCoreRoutes, { prefix: subpath });
  }

  return app;
}

