import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../../src/storage/database.js';
import { runMigrations } from '../../src/storage/migrations.js';
import { MessageRepository } from '../../src/storage/message-repository.js';
import { MessageBroker } from '../../src/realtime/broker.js';
import { MessageService } from '../../src/domain/message-service.js';
import { AuthService } from '../../src/domain/auth-service.js';
import { createLogger } from '../../src/utils/logger.js';
import { buildServer } from '../../src/api/server.js';
import { loadConfig } from '../../src/config/config.js';

describe('API Integration Tests', () => {
  let db: DatabaseSync;
  let repo: MessageRepository;
  let broker: MessageBroker;
  let messageService: MessageService;
  let logger: any;

  beforeEach(() => {
    db = createDatabase(':memory:');
    runMigrations(db);
    repo = new MessageRepository(db);
    broker = new MessageBroker();
    logger = createLogger('silent');
    messageService = new MessageService(
      repo,
      broker,
      { defaultCacheTtl: 3600, messageSizeLimit: 1024 },
      undefined,
      logger
    );
  });

  afterEach(() => {
    db.close();
  });

  it('GET /health returns health metrics', async () => {
    const config = loadConfig({ AUTH_MODE: 'none' });
    const authService = new AuthService({ mode: 'none', tokens: [] });
    const app = buildServer({ config, messageService, authService, logger });

    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
    expect(body.subscribers).toBe(0);
  });

  it('enforces token authentication when AUTH_MODE=token', async () => {
    const config = loadConfig({ AUTH_MODE: 'token', AUTH_TOKENS: 'secret_token_123' });
    const authService = new AuthService({ mode: 'token', tokens: ['secret_token_123'] });
    const app = buildServer({ config, messageService, authService, logger });

    // Unauthorized without token
    const unauthRes = await app.inject({
      method: 'POST',
      url: '/my-topic',
      body: 'Hello',
    });
    expect(unauthRes.statusCode).toBe(401);
    expect(JSON.parse(unauthRes.body).code).toBe(40101);

    // Authorized with Bearer header
    const authRes = await app.inject({
      method: 'POST',
      url: '/my-topic',
      headers: {
        authorization: 'Bearer secret_token_123',
      },
      body: 'Hello authorized',
    });
    expect(authRes.statusCode).toBe(200);

    // Authorized with query parameter ?auth=
    const queryAuthRes = await app.inject({
      method: 'POST',
      url: '/my-topic?auth=secret_token_123',
      body: 'Hello query auth',
    });
    expect(queryAuthRes.statusCode).toBe(200);
  });

  it('enforces rate limiting on publish endpoint', async () => {
    const config = loadConfig({ AUTH_MODE: 'none', RATE_LIMIT_PUBLISH: '2' });
    const authService = new AuthService({ mode: 'none', tokens: [] });
    const app = buildServer({ config, messageService, authService, logger });

    const r1 = await app.inject({ method: 'POST', url: '/alerts', body: '1' });
    expect(r1.statusCode).toBe(200);

    const r2 = await app.inject({ method: 'POST', url: '/alerts', body: '2' });
    expect(r2.statusCode).toBe(200);

    const r3 = await app.inject({ method: 'POST', url: '/alerts', body: '3' });
    expect(r3.statusCode).toBe(429);
    expect(JSON.parse(r3.body).code).toBe(42901);
  });

  it('rejects invalid topic names with 400 Bad Request', async () => {
    const config = loadConfig({ AUTH_MODE: 'none' });
    const authService = new AuthService({ mode: 'none', tokens: [] });
    const app = buildServer({ config, messageService, authService, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/..%2Ftraversal',
      body: 'Attack',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe(40001);
  });
});
