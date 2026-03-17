import winston from 'winston';

const SENSITIVE_KEY_PATTERN = /^(token|client_token|wrappedToken|wrapped_token|authorization|cookie)$/i;

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactValue(nestedValue),
      ])
    );
  }

  return value;
}

function serializeMeta(meta: Record<string, unknown>) {
  const sanitized = redactValue(meta);
  if (!sanitized || typeof sanitized !== 'object' || Object.keys(sanitized).length === 0) {
    return '';
  }

  return ` ${JSON.stringify(sanitized)}`;
}

const formatter = winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
  const resolvedMessage = typeof message === 'string' ? message : JSON.stringify(redactValue(message));
  const stackSuffix = stack ? `\n${stack}` : '';

  return `${timestamp} [${level.toUpperCase()}] ${resolvedMessage}${serializeMeta(meta)}${stackSuffix}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production'
    ? (process.env.LOG_LEVEL || 'warn')
    : (process.env.DEBUG === 'true' ? 'debug' : (process.env.LOG_LEVEL || 'info')),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    formatter
  ),
  transports: [
    new winston.transports.Console()
  ]
});

function logWithMeta(level: 'info' | 'debug' | 'warn' | 'error', message: string, args: unknown[]) {
  if (args.length > 0) {
    logger.log(level, message, { metadata: args });
    return;
  }

  logger.log(level, message);
}

export function serverLog(message: string, ...args: unknown[]) {
  logWithMeta('info', message, args);
}

export function serverDebug(message: string, ...args: unknown[]) {
  logWithMeta('debug', message, args);
}

export function serverError(message: string, ...args: unknown[]) {
  logWithMeta('error', message, args);
}

export function serverWarn(message: string, ...args: unknown[]) {
  logWithMeta('warn', message, args);
}

export default logger;
