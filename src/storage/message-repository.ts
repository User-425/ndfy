import type { DatabaseSync } from 'node:sqlite';
import type { NtfyMessage } from '../compatibility/ntfy-message.js';
import type { SinceOption } from '../utils/time.js';
import { nowUnix } from '../utils/time.js';

export interface FindMessagesOptions {
  since?: SinceOption | null;
  scheduled?: boolean;
  id?: string;
  limit?: number;
  tags?: string[];
  priority?: number;
}

export interface SaveMessageOptions {
  scheduledAt?: number;
  createdAt?: number;
}

interface MessageRow {
  id: string;
  topic: string;
  event: string;
  time: number;
  expires: number | null;
  message: string | null;
  title: string | null;
  priority: number | null;
  tags: string | null;
  click: string | null;
  icon: string | null;
  actions: string | null;
  attachment: string | null;
  poll_id: string | null;
  scheduled_at: number | null;
  created_at: number;
}

export class MessageRepository {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private rowToMessage(row: MessageRow): NtfyMessage {
    const msg: NtfyMessage = {
      id: row.id,
      time: row.time,
      event: 'message',
      topic: row.topic,
    };

    if (row.expires !== null && row.expires !== undefined) msg.expires = row.expires;
    if (row.message !== null && row.message !== undefined) msg.message = row.message;
    if (row.title !== null && row.title !== undefined) msg.title = row.title;
    if (row.priority !== null && row.priority !== undefined) msg.priority = row.priority;
    if (row.click !== null && row.click !== undefined) msg.click = row.click;
    if (row.icon !== null && row.icon !== undefined) msg.icon = row.icon;
    if (row.poll_id !== null && row.poll_id !== undefined) msg.poll_id = row.poll_id;

    if (row.tags) {
      try {
        msg.tags = JSON.parse(row.tags);
      } catch {
        // ignore malformed JSON
      }
    }

    if (row.actions) {
      try {
        msg.actions = JSON.parse(row.actions);
      } catch {
        // ignore malformed JSON
      }
    }

    if (row.attachment) {
      try {
        msg.attachment = JSON.parse(row.attachment);
      } catch {
        // ignore malformed JSON
      }
    }

    return msg;
  }

  public save(message: NtfyMessage, options?: SaveMessageOptions): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (
        id, topic, event, time, expires, message, title, priority,
        tags, click, icon, actions, attachment, poll_id, scheduled_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    const tagsJson = message.tags && message.tags.length > 0 ? JSON.stringify(message.tags) : null;
    const actionsJson = message.actions && message.actions.length > 0 ? JSON.stringify(message.actions) : null;
    const attachmentJson = message.attachment ? JSON.stringify(message.attachment) : null;
    const scheduledAt = options?.scheduledAt ?? null;
    const createdAt = options?.createdAt ?? nowUnix();

    stmt.run(
      message.id,
      message.topic,
      message.event || 'message',
      message.time,
      message.expires ?? null,
      message.message ?? null,
      message.title ?? null,
      message.priority ?? 3,
      tagsJson,
      message.click ?? null,
      message.icon ?? null,
      actionsJson,
      attachmentJson,
      message.poll_id ?? null,
      scheduledAt,
      createdAt
    );
  }

  public findById(id: string): NtfyMessage | null {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ? LIMIT 1');
    const row = stmt.get(id) as MessageRow | undefined;
    return row ? this.rowToMessage(row) : null;
  }

  public findByTopic(topic: string, options: FindMessagesOptions = {}): NtfyMessage[] {
    let sql = 'SELECT * FROM messages WHERE topic = ?';
    const params: any[] = [topic];

    // Exclude scheduled messages that are not yet due unless requested
    if (!options.scheduled) {
      sql += ' AND scheduled_at IS NULL';
    }

    if (options.id) {
      sql += ' AND id = ?';
      params.push(options.id);
    }

    if (options.priority !== undefined) {
      sql += ' AND priority >= ?';
      params.push(options.priority);
    }

    // Handle `since` parameter
    if (options.since) {
      if (options.since.type === 'time') {
        sql += ' AND time >= ?';
        params.push(options.since.unixTime);
      } else if (options.since.type === 'message_id') {
        const refMessage = this.findById(options.since.id);
        if (refMessage) {
          sql += ' AND time > ?';
          params.push(refMessage.time);
        }
      }
      // 'all' means no time restriction
    }

    sql += ' ORDER BY time ASC, created_at ASC';

    if (options.limit && options.limit > 0) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown as MessageRow[];
    let messages = rows.map((r) => this.rowToMessage(r));

    // In-memory filter for tags if specified
    if (options.tags && options.tags.length > 0) {
      const requiredTags = options.tags;
      messages = messages.filter((m) =>
        m.tags && requiredTags.some((t) => m.tags?.includes(t))
      );
    }

    return messages;
  }

  public findDueScheduled(currentUnix = nowUnix()): { message: NtfyMessage; scheduledAt: number }[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE scheduled_at IS NOT NULL AND scheduled_at <= ?
      ORDER BY scheduled_at ASC
    `);

    const rows = stmt.all(currentUnix) as unknown as MessageRow[];
    return rows.map((row) => ({
      message: this.rowToMessage(row),
      scheduledAt: row.scheduled_at!,
    }));
  }

  public clearScheduled(id: string): void {
    const stmt = this.db.prepare('UPDATE messages SET scheduled_at = NULL WHERE id = ?');
    stmt.run(id);
  }

  public deleteExpired(currentUnix = nowUnix()): number {
    const stmt = this.db.prepare(`
      DELETE FROM messages
      WHERE expires IS NOT NULL AND expires <= ?
    `);
    const result = stmt.run(currentUnix);
    return Number((result as any)?.changes || 0);
  }

  public count(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM messages');
    const result = stmt.get() as { count: number };
    return result.count;
  }
}
