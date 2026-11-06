import './tracing'; // must be first: patches http/express/pg before Nest requires them
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import pinoHttp from 'pino-http';
import * as crypto from 'crypto';
import * as path from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PinoLoggerService } from './common/logger/pino-logger.service';
import { MetricsService } from './metrics/metrics.service';
import { env } from './config/env';

async function bootstrap() {
  // bufferLogs holds Nest's bootstrap-time log lines until useLogger() is
  // called below, so nothing is lost or falls back to plain console.log.
  // rawBody: true keeps the original request Buffer available at
  // req.rawBody alongside the normally-parsed JSON body — needed by the
  // Stripe webhook route to verify the signature (payment.controller.ts).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
    bufferLogs: true,
    rawBody: true,
  });

  const pinoLogger = app.get(PinoLoggerService);
  app.useLogger(pinoLogger);

  const metrics = app.get(MetricsService);

  // Structured JSON access logs for every HTTP request (method, path, status,
  // duration, correlation id) — blueprint §7: "Pino JSON to stdout only".
  // This is ALSO how logs make it to Loki: Pino writes JSON to stdout,
  // Docker captures it as the container's log stream, and Promtail (see
  // infra/promtail/promtail-config.yml) tails that stream and ships it to
  // Loki — no separate "log file" or direct Loki transport needed.
  app.use(
    pinoHttp({
      logger: pinoLogger.raw,
      genReqId: (req: any) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // Prometheus HTTP metrics (multihub_http_requests_total / _duration_ms),
  // scraped from GET /metrics by the `prometheus` container.
  app.use((req: any, res: any, next: any) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const route = req.route?.path ?? req.url?.split('?')[0] ?? 'unknown';
      const labels = { method: req.method, route, status_code: String(res.statusCode) };
      metrics.httpRequestsTotal.inc(labels);
      metrics.httpRequestDurationMs.observe(labels, durationMs);
    });
    next();
  });

  // RULE-12 local storage strategy: uploaded files under LOCAL_UPLOAD_PATH
  // are served back out at /uploads/*. Only relevant when STORAGE_STRATEGY
  // isn't overridden to cloudinary/s3 (those return their own hosted URLs).
  app.useStaticAssets(path.resolve(env.localUploadPath), { prefix: '/uploads/' });

  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter(pinoLogger));

  await app.listen(env.port);
  pinoLogger.log(
    `MultiHub backend listening on http://localhost:${env.port} (Dapr: ${env.daprEnabled}, Stripe: ${env.stripeConfigured}, Google OAuth: ${env.googleOAuthConfigured}, Storage: ${env.storageStrategy})`,
    'Bootstrap',
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
