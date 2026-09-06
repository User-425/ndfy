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

describe('Ntfy Compatibility - Streaming & Realtime Transports', () => {
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
    const config = loadConfig({ AUTH_MODE: 'none', KEEPALIVE_INTERVAL: '1' });
    const authService = new AuthService({ mode: 'none', tokens: [] });
    app = buildServer({ config, messageService, authService, logger });
  });

  afterEach(() => {
    db.close();
  });

  it('delivers messages in JSON format when polling /:topic/json?poll=1', async () => {
    // Publish a message first
    await app.inject({
      method: 'POST',
      url: '/news',
      headers: { Title: 'Breaking News' },
      body: 'New version released',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/news/json?poll=1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');

    const lines = res.body.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const openEvent = JSON.parse(lines[0]);
    expect(openEvent).toEqual({ event: 'open', topic: 'news' });

    const msgEvent = JSON.parse(lines[1]);
    expect(msgEvent.event).toBe('message');
    expect(msgEvent.topic).toBe('news');
    expect(msgEvent.title).toBe('Breaking News');
    expect(msgEvent.message).toBe('New version released');
  });

  it('delivers messages in SSE format when polling /:topic/sse?poll=1', async () => {
    await app.inject({
      method: 'POST',
      url: '/sse-topic',
      body: 'SSE Message Test',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/sse-topic/sse?poll=1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('event: open\ndata: {"event":"open","topic":"sse-topic"}\n\n');
    expect(res.body).toContain('event: message\ndata: {');
    expect(res.body).toContain('"message":"SSE Message Test"');
  });

  it('delivers messages in Raw format when polling /:topic/raw?poll=1', async () => {
    await app.inject({
      method: 'POST',
      url: '/raw-topic',
      body: 'Raw message line 1',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/raw-topic/raw?poll=1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body.trim()).toBe('Raw message line 1');
  });

  it('delivers messages to multiple subscribers simultaneously', async () => {
    const subscriberA: any[] = [];
    const subscriberB: any[] = [];

    const subObjA = {
      id: 'subA',
      topic: 'broadcast-test',
      isClosed: false,
      send: (e: any) => subscriberA.push(e),
      close: () => {},
    };

    const subObjB = {
      id: 'subB',
      topic: 'broadcast-test',
      isClosed: false,
      send: (e: any) => subscriberB.push(e),
      close: () => {},
    };

    broker.subscribe('broadcast-test', subObjA);
    broker.subscribe('broadcast-test', subObjB);

    await app.inject({
      method: 'POST',
      url: '/broadcast-test',
      body: 'Broadcast message',
    });

    expect(subscriberA).toHaveLength(1);
    expect(subscriberB).toHaveLength(1);
    expect(subscriberA[0].message).toBe('Broadcast message');
    expect(subscriberB[0].message).toBe('Broadcast message');
  });
});
