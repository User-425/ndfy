import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createDatabase } from '../../src/storage/database.js';
import { runMigrations } from '../../src/storage/migrations.js';
import { MessageRepository } from '../../src/storage/message-repository.js';
import { MessageBroker } from '../../src/realtime/broker.js';
import { MessageService } from '../../src/domain/message-service.js';
import { AuthService } from '../../src/domain/auth-service.js';
import { createLogger } from '../../src/utils/logger.js';
import { buildServer } from '../../src/api/server.js';
import { loadConfig } from '../../src/config/config.js';

describe('Ntfy Compatibility - Persistence and Recovery', () => {
  const testDbPath = path.join(process.cwd(), 'data', 'test-persistence.db');

  afterEach(() => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch {
      // ignore
    }
  });

  it('persists messages across server restarts (Restart Recovery Test)', async () => {
    const logger = createLogger('silent');
    const config = loadConfig({
      DATABASE_PATH: testDbPath,
      AUTH_MODE: 'none',
    });

    // 1. Initial server startup
    let db = createDatabase(testDbPath);
    runMigrations(db);
    let repo = new MessageRepository(db);
    let broker = new MessageBroker();
    let messageService = new MessageService(repo, broker, {
      defaultCacheTtl: 3600,
      messageSizeLimit: 4096,
    });
    let authService = new AuthService({ mode: 'none', tokens: [] });
    let app = buildServer({ config, messageService, authService, logger });

    // 2. Publish message
    const publishRes = await app.inject({
      method: 'POST',
      url: '/restart-topic',
      headers: {
        Title: 'Persistent Alert',
        Priority: 'high',
      },
      body: 'Will survive restart',
    });
    expect(publishRes.statusCode).toBe(200);
    const publishedMsg = JSON.parse(publishRes.body);

    // 3. Stop server and close DB
    await app.close();
    db.close();

    // 4. Restart server with same database file
    db = createDatabase(testDbPath);
    repo = new MessageRepository(db);
    broker = new MessageBroker();
    messageService = new MessageService(repo, broker, {
      defaultCacheTtl: 3600,
      messageSizeLimit: 4096,
    });
    app = buildServer({ config, messageService, authService, logger });

    // 5. Poll topic on restarted server
    const pollRes = await app.inject({
      method: 'GET',
      url: '/restart-topic/json?poll=1',
    });

    expect(pollRes.statusCode).toBe(200);
    const lines = pollRes.body.trim().split('\n');
    expect(lines.length).toBe(2); // open + message

    const msgEvent = JSON.parse(lines[1]);
    expect(msgEvent.id).toBe(publishedMsg.id);
    expect(msgEvent.title).toBe('Persistent Alert');
    expect(msgEvent.message).toBe('Will survive restart');
    expect(msgEvent.priority).toBe(4);

    await app.close();
    db.close();
  });
});
