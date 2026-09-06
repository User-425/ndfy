import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateId, generateMessageId, generateSubscriberId } from '../../src/utils/id.js';
import { nowUnix, parseDuration, parseSince, parseDelay } from '../../src/utils/time.js';
import { isValidTopic, validateTopic, validateTopicList, InvalidTopicError } from '../../src/security/topic-validator.js';
import { MemoryRateLimiter } from '../../src/security/rate-limiter.js';
import { isPrivateIp, validateSafeUrl } from '../../src/security/ssrf.js';
import { loadConfig } from '../../src/config/config.js';

describe('ID Generator', () => {
  it('generates random IDs of proper length', () => {
    const id = generateId(12);
    expect(id).toHaveLength(12);
    expect(/^[0-9a-zA-Z]+$/.test(id)).toBe(true);

    const msgId = generateMessageId();
    expect(msgId).toHaveLength(12);

    const subId = generateSubscriberId();
    expect(subId).toHaveLength(16);
  });
});

describe('Time and Duration Utilities', () => {
  it('nowUnix returns integer timestamp in seconds', () => {
    const now = nowUnix();
    expect(typeof now).toBe('number');
    expect(now).toBeGreaterThan(1700000000);
  });

  it('parseDuration handles various units', () => {
    expect(parseDuration('30s')).toBe(30);
    expect(parseDuration('10m')).toBe(600);
    expect(parseDuration('2h')).toBe(7200);
    expect(parseDuration('1d')).toBe(86400);
    expect(parseDuration('1w')).toBe(604800);
    expect(parseDuration('120')).toBe(120);
    expect(parseDuration(300)).toBe(300);
    expect(parseDuration('invalid')).toBeNull();
  });

  it('parseSince parses all, timestamps, durations, and message IDs', () => {
    const now = 1700000000;
    expect(parseSince('all', now)).toEqual({ type: 'all' });
    expect(parseSince('10m', now)).toEqual({ type: 'time', unixTime: 1700000000 - 600 });
    expect(parseSince('1690000000', now)).toEqual({ type: 'time', unixTime: 1690000000 });
    expect(parseSince('msg_abc123', now)).toEqual({ type: 'message_id', id: 'msg_abc123' });
    expect(parseSince(undefined, now)).toBeNull();
  });

  it('parseDelay parses relative durations and future timestamps', () => {
    const now = 1700000000;
    expect(parseDelay('30m', now)).toBe(1700000000 + 1800);
    expect(parseDelay('1700005000', now)).toBe(1700005000);
    expect(parseDelay(undefined, now)).toBeNull();
  });
});

describe('Topic Validator', () => {
  it('accepts valid topics', () => {
    expect(isValidTopic('alerts')).toBe(true);
    expect(isValidTopic('my-topic_123')).toBe(true);
    expect(validateTopic('alerts')).toBe('alerts');
  });

  it('rejects path traversal, slashes, and control characters', () => {
    expect(isValidTopic('..')).toBe(false);
    expect(isValidTopic('foo/bar')).toBe(false);
    expect(isValidTopic('foo\\bar')).toBe(false);
    expect(isValidTopic('')).toBe(false);
    expect(isValidTopic('a'.repeat(65))).toBe(false);

    expect(() => validateTopic('..')).toThrow(InvalidTopicError);
    expect(() => validateTopic('topic/with/slash')).toThrow(InvalidTopicError);
    expect(() => validateTopic('topic\0null')).toThrow(InvalidTopicError);
  });

  it('validates topic lists', () => {
    expect(validateTopicList('alerts, metrics, backend')).toEqual(['alerts', 'metrics', 'backend']);
    expect(() => validateTopicList('')).toThrow(InvalidTopicError);
  });
});

describe('Rate Limiter', () => {
  let limiter: MemoryRateLimiter;

  beforeEach(() => {
    limiter = new MemoryRateLimiter({ windowMs: 1000, maxRequests: 2 });
  });

  afterEach(() => {
    limiter.destroy();
  });

  it('allows requests within limit and rejects exceeding', () => {
    const r1 = limiter.check('client-1');
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = limiter.check('client-1');
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = limiter.check('client-1');
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);

    // Another client is unaffected
    const r4 = limiter.check('client-2');
    expect(r4.allowed).toBe(true);
  });
});

describe('SSRF Protection', () => {
  it('detects private and loopback IPv4/IPv6', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);

    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
  });

  it('validates safe URLs', () => {
    expect(validateSafeUrl('https://example.com/icon.png').valid).toBe(true);
    expect(validateSafeUrl('http://127.0.0.1/secret').valid).toBe(false);
    expect(validateSafeUrl('http://localhost:3000').valid).toBe(false);
    expect(validateSafeUrl('ftp://example.com').valid).toBe(false);
  });
});

describe('Configuration Loader', () => {
  it('loads valid configuration with defaults', () => {
    const config = loadConfig({
      PORT: '9000',
      AUTH_MODE: 'token',
      AUTH_TOKENS: 'tk_1, tk_2',
    });

    expect(config.PORT).toBe(9000);
    expect(config.AUTH_MODE).toBe('token');
    expect(config.AUTH_TOKENS).toEqual(['tk_1', 'tk_2']);
  });
});
