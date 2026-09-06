import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../../src/storage/database.js';
import { runMigrations } from '../../src/storage/migrations.js';
import { MessageRepository } from '../../src/storage/message-repository.js';
import type { NtfyMessage } from '../../src/compatibility/ntfy-message.js';

describe('SQLite Storage & MessageRepository', () => {
  let db: DatabaseSync;
  let repo: MessageRepository;

  beforeEach(() => {
    db = createDatabase(':memory:');
    runMigrations(db);
    repo = new MessageRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('persists and retrieves a message by ID and by topic', () => {
    const msg: NtfyMessage = {
      id: 'msg_001',
      topic: 'alerts',
      time: 1700000000,
      event: 'message',
      message: 'Disk space warning',
      title: 'Disk Alert',
      priority: 4,
      tags: ['warning', 'disk'],
      click: 'https://example.com/disk',
    };

    repo.save(msg);

    const foundById = repo.findById('msg_001');
    expect(foundById).not.toBeNull();
    expect(foundById?.message).toBe('Disk space warning');
    expect(foundById?.priority).toBe(4);
    expect(foundById?.tags).toEqual(['warning', 'disk']);

    const byTopic = repo.findByTopic('alerts');
    expect(byTopic).toHaveLength(1);
    expect(byTopic[0].id).toBe('msg_001');
  });

  it('filters messages using since timestamp and message_id', () => {
    const msg1: NtfyMessage = {
      id: 'msg_001',
      topic: 'alerts',
      time: 100,
      event: 'message',
      message: 'Old message',
    };
    const msg2: NtfyMessage = {
      id: 'msg_002',
      topic: 'alerts',
      time: 200,
      event: 'message',
      message: 'Newer message',
    };

    repo.save(msg1);
    repo.save(msg2);

    const since150 = repo.findByTopic('alerts', { since: { type: 'time', unixTime: 150 } });
    expect(since150).toHaveLength(1);
    expect(since150[0].id).toBe('msg_002');

    const sinceMsg1 = repo.findByTopic('alerts', { since: { type: 'message_id', id: 'msg_001' } });
    expect(sinceMsg1).toHaveLength(1);
    expect(sinceMsg1[0].id).toBe('msg_002');
  });

  it('cleans up expired messages', () => {
    const msg1: NtfyMessage = {
      id: 'msg_001',
      topic: 'alerts',
      time: 100,
      expires: 150,
      event: 'message',
      message: 'Expiring message',
    };
    const msg2: NtfyMessage = {
      id: 'msg_002',
      topic: 'alerts',
      time: 100,
      expires: 300,
      event: 'message',
      message: 'Long lived message',
    };

    repo.save(msg1);
    repo.save(msg2);

    expect(repo.count()).toBe(2);

    const deleted = repo.deleteExpired(200);
    expect(deleted).toBe(1);
    expect(repo.count()).toBe(1);
    expect(repo.findById('msg_001')).toBeNull();
    expect(repo.findById('msg_002')).not.toBeNull();
  });

  it('handles scheduled delayed messages', () => {
    const scheduledMsg: NtfyMessage = {
      id: 'msg_sched',
      topic: 'delayed',
      time: 100,
      event: 'message',
      message: 'Scheduled payload',
    };

    repo.save(scheduledMsg, { scheduledAt: 250 });

    // Should not appear in standard findByTopic
    expect(repo.findByTopic('delayed')).toHaveLength(0);

    // Should appear in findDueScheduled when time arrives
    expect(repo.findDueScheduled(200)).toHaveLength(0);
    const due = repo.findDueScheduled(250);
    expect(due).toHaveLength(1);
    expect(due[0].message.id).toBe('msg_sched');

    // After clearing schedule
    repo.clearScheduled('msg_sched');
    expect(repo.findByTopic('delayed')).toHaveLength(1);
  });
});
