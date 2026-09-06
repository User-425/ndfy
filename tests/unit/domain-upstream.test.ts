import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../../src/storage/database.js';
import { runMigrations } from '../../src/storage/migrations.js';
import { MessageRepository } from '../../src/storage/message-repository.js';
import { MessageBroker } from '../../src/realtime/broker.js';
import { MessageService } from '../../src/domain/message-service.js';
import { UpstreamService } from '../../src/upstream/upstream-service.js';
import { AuthService } from '../../src/domain/auth-service.js';
import { SchedulerService } from '../../src/scheduler/scheduler-service.js';

describe('Upstream Service', () => {
  it('generates canonical URL and correct SHA-256 hash', () => {
    const upstream = new UpstreamService({
      enabled: true,
      publicBaseUrl: 'https://notify.example.com',
      upstreamBaseUrl: 'https://ntfy.sh',
    });

    const canonicalUrl = upstream.getCanonicalTopicUrl('my-alerts');
    expect(canonicalUrl).toBe('https://notify.example.com/my-alerts');

    const hash = upstream.getUpstreamTopicHash('my-alerts');
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });
});

describe('Auth Service', () => {
  it('permits all in mode none', () => {
    const auth = new AuthService({ mode: 'none', tokens: [] });
    expect(auth.isAuthorized()).toBe(true);
    expect(auth.isAuthorized('any-token')).toBe(true);
  });

  it('enforces token checks in mode token', () => {
    const auth = new AuthService({ mode: 'token', tokens: ['tk_secret123'] });
    expect(auth.isAuthorized()).toBe(false);
    expect(auth.isAuthorized('tk_wrong')).toBe(false);
    expect(auth.isAuthorized('tk_secret123')).toBe(true);
    expect(auth.isAuthorized('Bearer tk_secret123')).toBe(true);
  });
});

describe('Message Service & Scheduler', () => {
  let db: DatabaseSync;
  let repo: MessageRepository;
  let broker: MessageBroker;
  let messageService: MessageService;

  beforeEach(() => {
    db = createDatabase(':memory:');
    runMigrations(db);
    repo = new MessageRepository(db);
    broker = new MessageBroker();
    messageService = new MessageService(
      repo,
      broker,
      { defaultCacheTtl: 3600, messageSizeLimit: 4096 }
    );
  });

  afterEach(() => {
    db.close();
  });

  it('publishes and retrieves messages', async () => {
    const msg = await messageService.publish({
      topic: 'alerts',
      message: 'High CPU',
      title: 'Warning',
      priority: 4,
      tags: ['cpu'],
    });

    expect(msg.id).toBeDefined();
    expect(msg.topic).toBe('alerts');
    expect(msg.message).toBe('High CPU');
    expect(msg.priority).toBe(4);

    const cached = messageService.queryCachedMessages('alerts');
    expect(cached).toHaveLength(1);
    expect(cached[0].id).toBe(msg.id);
  });

  it('rejects oversized messages', async () => {
    const largeMessage = 'A'.repeat(5000);
    await expect(
      messageService.publish({
        topic: 'alerts',
        message: largeMessage,
      })
    ).rejects.toThrow('exceeds maximum size');
  });

  it('dispatches delayed messages via scheduler', async () => {
    const scheduler = new SchedulerService(repo, messageService, {
      cleanupIntervalSeconds: 60,
      scheduledPollIntervalMs: 100,
    });

    // Schedule message 1 second into the past/future
    const scheduledMsg = await messageService.publish({
      topic: 'delayed-topic',
      message: 'Delayed alert',
      delay: '1s',
    });

    // Initially not in regular query
    expect(messageService.queryCachedMessages('delayed-topic')).toHaveLength(0);

    // Run scheduler check
    scheduler.checkScheduledMessages();

    scheduler.stop();
  });
});
