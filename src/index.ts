import { loadConfig } from './config/config.js';
import { createLogger } from './utils/logger.js';
import { createDatabase } from './storage/database.js';
import { runMigrations } from './storage/migrations.js';
import { MessageRepository } from './storage/message-repository.js';
import { MessageBroker } from './realtime/broker.js';
import { MessageService } from './domain/message-service.js';
import { AuthService } from './domain/auth-service.js';
import { UpstreamService } from './upstream/upstream-service.js';
import { SchedulerService } from './scheduler/scheduler-service.js';
import { buildServer } from './api/server.js';
import { registerGracefulShutdown } from './utils/shutdown.js';

async function bootstrap() {
  // 1. Load and validate configuration
  const config = loadConfig();

  // 2. Initialize logger
  const logger = createLogger(config.LOG_LEVEL);
  logger.info({ host: config.HOST, port: config.PORT }, 'Starting ndfy server...');

  // 3. Initialize SQLite database & migrations
  const db = createDatabase(config.DATABASE_PATH);
  runMigrations(db);
  logger.info({ path: config.DATABASE_PATH }, 'SQLite database initialized with WAL mode');

  // 4. Initialize storage & realtime components
  const repo = new MessageRepository(db);
  const broker = new MessageBroker();

  // 5. Initialize upstream push service if configured
  const upstream = new UpstreamService(
    {
      enabled: config.UPSTREAM_ENABLED,
      publicBaseUrl: config.PUBLIC_BASE_URL,
      upstreamBaseUrl: config.UPSTREAM_BASE_URL,
      upstreamAccessToken: config.UPSTREAM_ACCESS_TOKEN,
    },
    logger
  );

  // 6. Initialize domain services
  const messageService = new MessageService(
    repo,
    broker,
    {
      defaultCacheTtl: config.MESSAGE_CACHE_TTL,
      messageSizeLimit: config.MESSAGE_SIZE_LIMIT,
    },
    upstream,
    logger
  );

  const authService = new AuthService({
    mode: config.AUTH_MODE,
    tokens: config.AUTH_TOKENS,
  });

  // 7. Initialize background scheduler
  const scheduler = new SchedulerService(
    repo,
    messageService,
    {
      cleanupIntervalSeconds: config.CLEANUP_INTERVAL,
    },
    logger
  );
  scheduler.start();

  // 8. Build Fastify application
  const app = buildServer({
    config,
    messageService,
    authService,
    logger,
  });

  // 9. Register graceful shutdown
  registerGracefulShutdown({
    server: app,
    db,
    scheduler,
    broker,
    logger,
  });

  // 10. Start listening
  try {
    await app.listen({ host: config.HOST, port: config.PORT });
    logger.info(`Server listening at http://${config.HOST}:${config.PORT}`);
    logger.info(`Public URL configured as: ${config.PUBLIC_BASE_URL}`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
