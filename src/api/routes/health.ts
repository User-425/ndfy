import type { FastifyPluginAsync } from 'fastify';
import type { MessageService } from '../../domain/message-service.js';

export interface HealthRouteOptions {
  messageService: MessageService;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (fastify, opts) => {
  const { messageService } = opts;

  fastify.get('/health', async (_request, reply) => {
    let dbStatus = 'connected';
    let messageCount = 0;

    try {
      messageCount = messageService.getRepository().count();
    } catch {
      dbStatus = 'error';
    }

    reply.status(200).send({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      database: dbStatus,
      subscribers: messageService.getBroker().subscriberCount(),
      messages_count: messageCount,
    });
  });
};
