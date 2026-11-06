import { Injectable, LoggerService } from '@nestjs/common';
import pino, { Logger as PinoInstance } from 'pino';
import { env } from '../../config/env';

// RULE-09: Pino JSON to stdout only, no console.log in production.
// Redact anything sensitive so tokens/passwords never end up in logs.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  'token',
  '*.token',
  'accessToken',
  'refreshToken',
  '*.accessToken',
  '*.refreshToken',
  'codeHash',
  '*.codeHash',
];

function buildPino(): PinoInstance {
  return pino({
    level: env.logLevel,
    base: { service: env.serviceName, env: env.nodeEnv },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    transport:
      env.logPretty && env.nodeEnv !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } }
        : undefined,
  });
}

/**
 * A Nest-compatible LoggerService backed by Pino. Wired in main.ts via
 * `app.useLogger(...)`, which means every `new Logger('SomeContext')` call
 * anywhere in the app — Nest's own framework bootstrap logs included —
 * automatically routes through this Pino instance and comes out as
 * structured JSON on stdout (or pretty-printed in dev when LOG_PRETTY=true).
 * Services that want a scoped child logger with extra fields (e.g. topic,
 * aggregateId) can also inject PinoLoggerService directly and call
 * `.child({...})`.
 */
@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger: PinoInstance = buildPino();

  log(message: any, context?: string) {
    this.logger.info({ context }, this.toMessage(message));
  }

  error(message: any, trace?: string, context?: string) {
    this.logger.error({ context, trace }, this.toMessage(message));
  }

  warn(message: any, context?: string) {
    this.logger.warn({ context }, this.toMessage(message));
  }

  debug(message: any, context?: string) {
    this.logger.debug({ context }, this.toMessage(message));
  }

  verbose(message: any, context?: string) {
    this.logger.trace({ context }, this.toMessage(message));
  }

  child(bindings: Record<string, any>): PinoInstance {
    return this.logger.child(bindings);
  }

  /** Raw pino instance — used to wire pino-http for structured HTTP access logs. */
  get raw(): PinoInstance {
    return this.logger;
  }

  private toMessage(message: any): string {
    return typeof message === 'string' ? message : JSON.stringify(message);
  }
}
