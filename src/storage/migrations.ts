import type { DatabaseSync } from 'node:sqlite';

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      event TEXT NOT NULL DEFAULT 'message',
      time INTEGER NOT NULL,
      expires INTEGER,
      message TEXT,
      title TEXT,
      priority INTEGER DEFAULT 3,
      tags TEXT,
      click TEXT,
      icon TEXT,
      actions TEXT,
      attachment TEXT,
      poll_id TEXT,
      scheduled_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_topic_time ON messages (topic, time);
    CREATE INDEX IF NOT EXISTS idx_messages_expires ON messages (expires);
    CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON messages (scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_messages_poll_id ON messages (poll_id);
  `);
}
