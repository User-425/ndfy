import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { SchedulerService } from '../scheduler/scheduler-service.js';
import type { MessageBroker } from '../realtime/broker.js';
import type { Logger } from './logger.js';

export interface ShutdownDependencies {
  server: { close: () => Promise<void> | void };
  db: DatabaseSync;
  scheduler: SchedulerService;
  broker: MessageBroker;
  logger: Logger;
}

export function registerGracefulShutdown(deps: ShutdownDependencies): void {
  const { server, db, scheduler, broker, logger } = deps;

  let shuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Received termination signal, initiating graceful shutdown...');

    try {
      // 1. Stop accepting new HTTP / WS requests
      await server.close();
      logger.info('HTTP server closed');

      // 2. Stop scheduler
      scheduler.stop();
      logger.info('Scheduler stopped');

      // 3. Close realtime subscriber connections
      broker.closeAll();
      logger.info('Realtime connections closed');

      // 4. Close database connection
      db.close();
      logger.info('Database closed');

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}
