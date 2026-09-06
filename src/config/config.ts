import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:8080'),
  DATABASE_PATH: z.string().default('./data/ndfy.db'),
  MESSAGE_CACHE_TTL: z.coerce.number().int().min(1).default(43200), // 12 hours in seconds
  MESSAGE_SIZE_LIMIT: z.coerce.number().int().min(64).default(4096), // 4 KB in bytes
  KEEPALIVE_INTERVAL: z.coerce.number().int().min(1).default(45), // 45 seconds
  CLEANUP_INTERVAL: z.coerce.number().int().min(1).default(300), // 5 minutes in seconds
  AUTH_MODE: z.enum(['none', 'token']).default('none'),
  AUTH_TOKENS: z
    .string()
    .optional()
    .default('')
    .transform((val) =>
      val
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    ),
  RATE_LIMIT_PUBLISH: z.coerce.number().int().min(0).default(60), // requests/min (0 = disabled)
  RATE_LIMIT_SUBSCRIBE: z.coerce.number().int().min(0).default(120), // requests/min (0 = disabled)
  UPSTREAM_ENABLED: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val === 'true' || val === '1'),
  UPSTREAM_BASE_URL: z.string().url().default('https://ntfy.sh'),
  UPSTREAM_ACCESS_TOKEN: z.string().optional().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TRUST_PROXY: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val === 'true' || val === '1'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errorDetails}`);
  }

  // Validate upstream requirements
  if (result.data.UPSTREAM_ENABLED) {
    if (!result.data.PUBLIC_BASE_URL || result.data.PUBLIC_BASE_URL === 'http://localhost:8080') {
      // In production upstream push, public base URL must be configured
    }
  }

  return result.data;
}
