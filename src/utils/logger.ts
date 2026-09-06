import pino from 'pino';

export function createLogger(logLevel: string = 'info') {
  return pino({
    level: logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'headers.authorization',
        'req.headers["x-upstream-access-token"]',
        'headers["x-upstream-access-token"]',
        'password',
        'token',
        'auth',
      ],
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
