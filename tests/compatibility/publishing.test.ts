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

describe('Ntfy Compatibility - Publishing API', () => {
  let db: DatabaseSync;
  let repo: MessageRepository;
  let broker: MessageBroker;
  let messageService: MessageService;
  let logger: any;
  let app: any;

  beforeEach(() => {
    db = createDatabase(':memory:');
    runMigrations(db);
    repo = new MessageRepository(db);
    broker = new MessageBroker();
    logger = createLogger('silent');
    messageService = new MessageService(
      repo,
      broker,
      { defaultCacheTtl: 3600, messageSizeLimit: 4096 },
      undefined,
      logger
    );
    const config = loadConfig({ AUTH_MODE: 'none' });
    const authService = new AuthService({ mode: 'none', tokens: [] });
    app = buildServer({ config, messageService, authService, logger });
  });

  afterEach(() => {
    db.close();
  });

  it('handles plain text POST /:topic with ntfy headers (Definition of Done test)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/my-topic',
      headers: {
        Title: 'Server Alert',
        Priority: 'high',
        Tags: 'warning, computer',
        Click: 'https://notify.example.com/view',
        Icon: 'https://notify.example.com/icon.png',
      },
      body: 'Something happened',
    });

    expect(res.statusCode).toBe(200);
    const msg = JSON.parse(res.body);

    expect(msg.id).toBeDefined();
    expect(typeof msg.time).toBe('number');
    expect(msg.event).toBe('message');
    expect(msg.topic).toBe('my-topic');
    expect(msg.message).toBe('Something happened');
    expect(msg.title).toBe('Server Alert');
    expect(msg.priority).toBe(4);
    expect(msg.tags).toEqual(['warning', 'computer']);
    expect(msg.click).toBe('https://notify.example.com/view');
    expect(msg.icon).toBe('https://notify.example.com/icon.png');
  });

  it('handles plain text PUT /:topic with X- prefixed headers', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/backup-jobs',
      headers: {
        'x-title': 'Backup Complete',
        'x-priority': '2',
        'x-tags': 'floppy_disk, white_check_mark',
      },
      body: 'Nightly database backup finished in 42s',
    });

    expect(res.statusCode).toBe(200);
    const msg = JSON.parse(res.body);
    expect(msg.topic).toBe('backup-jobs');
    expect(msg.title).toBe('Backup Complete');
    expect(msg.priority).toBe(2);
    expect(msg.tags).toEqual(['floppy_disk', 'white_check_mark']);
  });

  it('handles root JSON publishing POST /', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        topic: 'alerts',
        title: 'Server Alert',
        message: 'CPU usage exceeded 90%',
        priority: 4,
        tags: ['warning'],
      }),
    });

    expect(res.statusCode).toBe(200);
    const msg = JSON.parse(res.body);
    expect(msg.topic).toBe('alerts');
    expect(msg.title).toBe('Server Alert');
    expect(msg.message).toBe('CPU usage exceeded 90%');
    expect(msg.priority).toBe(4);
    expect(msg.tags).toEqual(['warning']);
  });

  it('rejects root JSON publishing without topic field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Missing topic field',
      }),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(40001);
  });

  it('parses ntfy actions header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/iot',
      headers: {
        Actions: 'view, Open Cam, https://home.local/cam; http, Turn Off, https://home.local/light/off, method=POST',
      },
      body: 'Motion detected in backyard',
    });

    expect(res.statusCode).toBe(200);
    const msg = JSON.parse(res.body);
    expect(msg.actions).toHaveLength(2);
    expect(msg.actions[0]).toEqual({
      action: 'view',
      label: 'Open Cam',
      url: 'https://home.local/cam',
    });
    expect(msg.actions[1]).toEqual({
      action: 'http',
      label: 'Turn Off',
      url: 'https://home.local/light/off',
      method: 'POST',
    });
  });

  it('honors Cache: no header to avoid database persistence', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ephemeral',
      headers: {
        'x-cache': 'no',
      },
      body: 'Do not save this message in SQLite',
    });

    expect(res.statusCode).toBe(200);
    const msg = JSON.parse(res.body);

    const fromDb = repo.findById(msg.id);
    expect(fromDb).toBeNull();
  });
});
