/**
 * Topic validation rules according to ntfy protocol:
 * - Length: 1 to 64 characters
 * - Characters: ASCII letters, numbers, underscores, and hyphens (regex: /^[a-zA-Z0-9_-]{1,64}$/)
 * - No slashes, backslashes, path traversal (., ..), control chars, or null bytes.
 */

const TOPIC_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;

export class InvalidTopicError extends Error {
  constructor(topic: string, reason: string) {
    super(`Invalid topic "${topic}": ${reason}`);
    this.name = 'InvalidTopicError';
  }
}

export function isValidTopic(topic: unknown): topic is string {
  if (typeof topic !== 'string') return false;
  const trimmed = topic.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) return false;
  return TOPIC_REGEX.test(trimmed);
}

export function validateTopic(topic: unknown): string {
  if (typeof topic !== 'string' || topic.trim() === '') {
    throw new InvalidTopicError(String(topic), 'Topic must be a non-empty string');
  }

  let trimmed = topic.trim();

  // If user passed a full URL (e.g. pasted into topic field in ntfy client)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const segments = parsed.pathname.split('/').filter(Boolean);
      trimmed = segments.pop() || trimmed;
    } catch {
      // ignore
    }
  }

  // Strip leading and trailing slashes if present
  trimmed = trimmed.replace(/^\/+|\/+$/g, '');

  if (trimmed === '') {
    throw new InvalidTopicError(String(topic), 'Topic must be a non-empty string');
  }

  if (trimmed.length > 64) {
    throw new InvalidTopicError(trimmed, 'Topic length cannot exceed 64 characters');
  }

  if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new InvalidTopicError(trimmed, 'Path traversal or slashes are not allowed in topic names');
  }

  // Check for control characters
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 32 || code === 127) {
      throw new InvalidTopicError(trimmed, 'Control characters are not allowed');
    }
  }

  if (!TOPIC_REGEX.test(trimmed)) {
    throw new InvalidTopicError(
      trimmed,
      'Topic contains invalid characters (only alphanumeric, dashes, underscores, and dots allowed)'
    );
  }

  return trimmed;
}

/**
 * Validate comma-separated or multi-topic list (e.g. "topic1,topic2")
 */
export function validateTopicList(topicsInput: unknown): string[] {
  if (Array.isArray(topicsInput)) {
    const list = topicsInput.map(String).map((t) => t.trim()).filter(Boolean);
    if (list.length === 0) {
      throw new InvalidTopicError(String(topicsInput), 'No valid topics provided in list');
    }
    return list.flatMap((item) => item.split(',')).map((t) => t.trim()).filter(Boolean).map(validateTopic);
  }

  if (typeof topicsInput !== 'string' || topicsInput.trim() === '') {
    throw new InvalidTopicError(String(topicsInput), 'Topic must be a non-empty string');
  }

  const parts = topicsInput.split(',').map((t) => t.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new InvalidTopicError(topicsInput, 'No valid topics provided in list');
  }
  return parts.map(validateTopic);
}
