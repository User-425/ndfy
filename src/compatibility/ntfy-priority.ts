/**
 * ntfy priority mapping:
 * 1 = min / verylow
 * 2 = low
 * 3 = default / normal
 * 4 = high
 * 5 = max / urgent / emergency
 */

export const PRIORITY_MIN = 1;
export const PRIORITY_LOW = 2;
export const PRIORITY_DEFAULT = 3;
export const PRIORITY_HIGH = 4;
export const PRIORITY_MAX = 5;

const STRING_PRIORITY_MAP: Record<string, number> = {
  min: PRIORITY_MIN,
  verylow: PRIORITY_MIN,
  '1': PRIORITY_MIN,

  low: PRIORITY_LOW,
  '2': PRIORITY_LOW,

  default: PRIORITY_DEFAULT,
  normal: PRIORITY_DEFAULT,
  '3': PRIORITY_DEFAULT,

  high: PRIORITY_HIGH,
  '4': PRIORITY_HIGH,

  max: PRIORITY_MAX,
  urgent: PRIORITY_MAX,
  emergency: PRIORITY_MAX,
  '5': PRIORITY_MAX,
};

/**
 * Parses and normalizes any priority value into integer 1-5.
 * Defaults to 3 (default/normal) if invalid or unspecified.
 */
export function parsePriority(val: unknown): number {
  if (typeof val === 'number') {
    if (Number.isInteger(val) && val >= 1 && val <= 5) {
      return val;
    }
    return PRIORITY_DEFAULT;
  }

  if (typeof val === 'string') {
    const clean = val.trim().toLowerCase();
    const mapped = STRING_PRIORITY_MAP[clean];
    if (mapped !== undefined) {
      return mapped;
    }
  }

  return PRIORITY_DEFAULT;
}
