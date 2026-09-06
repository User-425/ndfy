import { describe, it, expect } from 'vitest';
import { parsePriority, PRIORITY_MIN, PRIORITY_DEFAULT, PRIORITY_MAX } from '../../src/compatibility/ntfy-priority.js';
import { parsePublishHeaders, parseActionsHeader, getHeader } from '../../src/compatibility/ntfy-headers.js';
import { parseSubscriptionQuery } from '../../src/compatibility/ntfy-query.js';
import { serializeNtfyEvent, type NtfyMessage } from '../../src/compatibility/ntfy-message.js';
import { NtfyError, createBadRequestError, createRateLimitError } from '../../src/compatibility/ntfy-errors.js';

describe('Priority Parser', () => {
  it('parses numeric values correctly', () => {
    expect(parsePriority(1)).toBe(1);
    expect(parsePriority(5)).toBe(5);
    expect(parsePriority(99)).toBe(PRIORITY_DEFAULT);
  });

  it('parses string aliases correctly', () => {
    expect(parsePriority('min')).toBe(PRIORITY_MIN);
    expect(parsePriority('low')).toBe(2);
    expect(parsePriority('default')).toBe(PRIORITY_DEFAULT);
    expect(parsePriority('high')).toBe(4);
    expect(parsePriority('max')).toBe(PRIORITY_MAX);
    expect(parsePriority('urgent')).toBe(PRIORITY_MAX);
    expect(parsePriority('emergency')).toBe(PRIORITY_MAX);
    expect(parsePriority('5')).toBe(PRIORITY_MAX);
  });
});

describe('Header Parser', () => {
  it('extracts headers case-insensitively with X- prefixes and aliases', () => {
    const headers = {
      'x-title': 'Server Alert',
      'priority': 'urgent',
      'x-tags': 'warning, skull',
      'x-click': 'https://example.com/alerts',
      'icon': 'https://example.com/icon.png',
      'x-delay': '10m',
      'x-cache': 'no',
    };

    const parsed = parsePublishHeaders(headers);
    expect(parsed.title).toBe('Server Alert');
    expect(parsed.priority).toBe(5);
    expect(parsed.tags).toEqual(['warning', 'skull']);
    expect(parsed.click).toBe('https://example.com/alerts');
    expect(parsed.icon).toBe('https://example.com/icon.png');
    expect(parsed.delay).toBe('10m');
    expect(parsed.cache).toBe(false);
  });

  it('parses action headers both in JSON and shorthand formats', () => {
    const jsonAction = '[{"action":"view","label":"Open portal","url":"https://example.com"}]';
    expect(parseActionsHeader(jsonAction)).toEqual([
      { action: 'view', label: 'Open portal', url: 'https://example.com' },
    ]);

    const shorthandAction = 'view, Open Website, https://example.com; http, Restart, https://api.com/restart, method=POST';
    const parsed = parseActionsHeader(shorthandAction);
    expect(parsed).toEqual([
      { action: 'view', label: 'Open Website', url: 'https://example.com' },
      { action: 'http', label: 'Restart', url: 'https://api.com/restart', method: 'POST' },
    ]);
  });
});

describe('Query Parser', () => {
  it('parses poll and since parameters', () => {
    const query = {
      poll: '1',
      since: '10m',
      tags: 'warn, error',
    };

    const parsed = parseSubscriptionQuery(query);
    expect(parsed.poll).toBe(true);
    expect(parsed.since?.type).toBe('time');
    expect(parsed.tags).toEqual(['warn', 'error']);
  });
});

describe('Message Serializer', () => {
  it('serializes message omitting undefined fields', () => {
    const msg: NtfyMessage = {
      id: 'abc123456789',
      time: 1700000000,
      event: 'message',
      topic: 'alerts',
      message: 'Hello World',
      title: 'Alert',
    };

    const serialized = serializeNtfyEvent(msg);
    const parsed = JSON.parse(serialized);
    expect(parsed.id).toBe('abc123456789');
    expect(parsed.message).toBe('Hello World');
    expect(parsed.title).toBe('Alert');
    expect('priority' in parsed).toBe(false);
    expect('tags' in parsed).toBe(false);
  });
});

describe('Error Formatter', () => {
  it('formats ntfy error JSON correctly', () => {
    const err = createBadRequestError('Invalid topic');
    expect(err.httpStatus).toBe(400);
    expect(err.toJSON()).toEqual({
      code: 40001,
      http: 400,
      error: 'Invalid topic',
    });

    const rateErr = createRateLimitError();
    expect(rateErr.httpStatus).toBe(429);
    expect(rateErr.toJSON()).toEqual({
      code: 42901,
      http: 429,
      error: 'Rate limit exceeded',
    });
  });
});
