import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { createDatabase } from '../../src/storage/database.js';
import { runMigrations } from '../../src/storage/migrations.js';
import { MessageRepository } from '../../src/storage/message-repository.js';
import { MessageBroker } from '../../src/realtime/broker.js';
import { MessageService } from '../../src/domain/message-service.js';
import { UpstreamService } from '../../src/upstream/upstream-service.js';
import { AuthService } from '../../src/domain/auth-service.js';
import { createLogger } from '../../src/utils/logger.js';
import { buildServer } from '../../src/api/server.js';
import { loadConfig } from '../../src/config/config.js';

describe('Ntfy Compatibility - Upstream Push Integration', () => {
  let db: DatabaseSync;
  let repo: MessageRepository;
  let broker: MessageBroker;
  let logger: any;

  beforeEach(() => {
    db = createDatabase(':memory:');
    runMigrations(db);
    repo = new MessageRepository(db);
    broker = new MessageBroker();
    logger = createLogger('silent');
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  it('correctly hashes canonical topic URL and sends upstream poll request with X-Poll-ID', async () => {
    const publicBaseUrl = 'https://notify.example.com';
    const upstreamBaseUrl = 'https://mock-ntfy.example.com';
    const topic = 'phone-alerts';

    const expectedCanonicalUrl = 'https://notify.example.com/phone-alerts';
    const expectedHash = crypto.createHash('sha256').update(expectedCanonicalUrl).digest('hex');

    let interceptedUrl = '';
    let interceptedHeaders: any = {};
    let interceptedBody = '';

    // Mock global fetch to verify request without making external network calls
    vi.stubGlobal('fetch', vi.fn(async (url: any, opts: any) => {
      interceptedUrl = url.toString();
      interceptedHeaders = opts.headers;
      interceptedBody = opts.body;
      return {
        ok: true,
        status: 200,
        text: async () => 'OK',
      };
    }));

    const upstreamService = new UpstreamService({
      enabled: true,
      publicBaseUrl,
      upstreamBaseUrl,
      upstreamAccessToken: 'mock_upstream_token',
    }, logger);

    const messageService = new MessageService(
      repo,
      broker,
      { defaultCacheTtl: 3600, messageSizeLimit: 4096 },
      upstreamService,
      logger
    );

    const config = loadConfig({
      AUTH_MODE: 'none',
      UPSTREAM_ENABLED: 'true',
      PUBLIC_BASE_URL: publicBaseUrl,
      UPSTREAM_BASE_URL: upstreamBaseUrl,
    });
    const authService = new AuthService({ mode: 'none', tokens: [] });
    const app = buildServer({ config, messageService, authService, logger });

    // Publish message
    const res = await app.inject({
      method: 'POST',
      url: `/${topic}`,
      body: 'Secret private message content that should NOT be sent upstream',
    });

    expect(res.statusCode).toBe(200);
    const msg = JSON.parse(res.body);

    // Wait a brief tick for async upstream fetch
    await new Promise((r) => setTimeout(r, 50));

    expect(interceptedUrl).toBe(`${upstreamBaseUrl}/${expectedHash}`);
    expect(interceptedHeaders['X-Poll-ID']).toBe(msg.id);
    expect(interceptedHeaders['Authorization']).toBe('Bearer mock_upstream_token');
    // Content body must NOT leak private notification content
    expect(interceptedBody).toBe('');
  });
});
