/**
 * Return current Unix time in seconds.
 */
export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

const DURATION_REGEX = /^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hrs?|hours?|d|days?|w|weeks?)?$/i;

/**
 * Parse human-readable duration strings into seconds.
 * Example: '30s' -> 30, '10m' -> 600, '2h' -> 7200, '1d' -> 86400, '1w' -> 604800
 */
export function parseDuration(input: string | number): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 ? Math.floor(input) : null;
  }

  const str = input.trim();
  if (!str) return null;

  // Pure integer string
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }

  const match = str.match(DURATION_REGEX);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();

  switch (unit) {
    case 's':
    case 'sec':
    case 'second':
    case 'seconds':
      return value;
    case 'm':
    case 'min':
    case 'minute':
    case 'minutes':
      return value * 60;
    case 'h':
    case 'hr':
    case 'hrs':
    case 'hour':
    case 'hours':
      return value * 3600;
    case 'd':
    case 'day':
    case 'days':
      return value * 86400;
    case 'w':
    case 'week':
    case 'weeks':
      return value * 604800;
    default:
      return null;
  }
}

export type SinceOption =
  | { type: 'all' }
  | { type: 'time'; unixTime: number }
  | { type: 'message_id'; id: string };

/**
 * Parse ntfy `since` query parameter.
 * Options:
 * - 'all' -> retrieve all cached
 * - '10m', '1h', '2d' -> retrieve messages from (now - duration)
 * - Unix timestamp -> e.g. 1700000000
 * - Message ID -> e.g. '1r9dKz3L2P'
 */
export function parseSince(sinceStr?: string, currentUnix = nowUnix()): SinceOption | null {
  if (!sinceStr) return null;

  const val = sinceStr.trim();
  if (!val) return null;

  if (val.toLowerCase() === 'all') {
    return { type: 'all' };
  }

  // Check if it's a duration like 10m or 1h
  const duration = parseDuration(val);
  if (duration !== null) {
    // If value looks like a unix timestamp (e.g. > 1000000000)
    if (duration > 1000000000) {
      return { type: 'time', unixTime: duration };
    }
    // Otherwise it's a relative offset
    return { type: 'time', unixTime: Math.max(0, currentUnix - duration) };
  }

  // If not a pure number/duration, treat as a Message ID
  return { type: 'message_id', id: val };
}

/**
 * Parse ntfy `delay` header / parameter.
 * Can be a relative duration ('30m') or absolute Unix timestamp.
 * Returns scheduled Unix timestamp in seconds, or null if invalid / not present.
 */
export function parseDelay(delayStr?: string, currentUnix = nowUnix()): number | null {
  if (!delayStr) return null;
  const val = delayStr.trim();
  if (!val) return null;

  const duration = parseDuration(val);
  if (duration === null) return null;

  // If it's a future Unix timestamp (e.g. > current timestamp)
  if (duration > currentUnix) {
    return duration;
  }

  // Otherwise relative duration from now
  return currentUnix + duration;
}
