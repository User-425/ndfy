import crypto from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generate a random alphanumeric string ID of the specified length.
 * Matches ntfy message ID format (alphanumeric, URL-safe).
 */
export function generateId(length = 12): string {
  const bytes = crypto.randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}

export function generateMessageId(): string {
  return generateId(12);
}

export function generateSubscriberId(): string {
  return generateId(16);
}
