// RULE-08: NEVER use process.env in business logic. Import only from here.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const parsedRedisUrl = new URL(REDIS_URL);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  serviceName: process.env.SERVICE_NAME ?? 'multihub-backend',

  // DATABASE_URL is what PrismaClient uses at runtime for every query — in
  // the Dockerized stack this goes through PgBouncer (connection pooling,
  // transaction mode) for efficient concurrent access. DIRECT_DATABASE_URL
  // bypasses the pooler and talks straight to Postgres; Prisma needs this
  // for schema operations (`migrate`/`db push`) because PgBouncer's
  // transaction-pooling mode doesn't support the prepared statements those
  // commands require. See prisma/schema.prisma's `directUrl`.
  databaseUrl: process.env.DATABASE_URL ?? '',
  directDatabaseUrl: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',

  redisUrl: REDIS_URL,
  // Parsed out separately because BullMQ's `connection` option wants a
  // {host, port} object (or an ioredis instance), not a connection string.
  redisHost: parsedRedisUrl.hostname,
  redisPort: parseInt(parsedRedisUrl.port || '6379', 10),

  // ── Auth (JWT) ──────────────────────────────────────────────────────
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret_min_32_chars_xxxxxxx',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_min_32_chars_xxxxxx',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  // ── Google OAuth ────────────────────────────────────────────────────
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3001/api/auth/google/callback',
  get googleOAuthConfigured(): boolean {
    return Boolean(this.googleClientId && this.googleClientSecret);
  },

  // ── Stripe ──────────────────────────────────────────────────────────
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  get stripeConfigured(): boolean {
    return Boolean(this.stripeSecretKey && this.stripeSecretKey.startsWith('sk_'));
  },

  // ── Storage strategy (RULE-12) ──────────────────────────────────────
  storageStrategy: process.env.STORAGE_STRATEGY ?? 'local', // 'local' | 'cloudinary' | 's3'
  localUploadPath: process.env.LOCAL_UPLOAD_PATH ?? './uploads',

  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? '',

  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  awsS3Region: process.env.AWS_S3_REGION ?? 'us-east-1',
  awsS3Bucket: process.env.AWS_S3_BUCKET ?? '',

  // ── SMTP / Email ─────────────────────────────────────────────────────
  // SMTP_USER/SMTP_PASS are optional — MailHog (the default, Dockerized
  // SMTP catcher) needs no auth at all. Set both to use a real provider
  // (Gmail, SendGrid, etc); nodemailer's `auth` block is omitted entirely
  // when they're empty, since passing `{ user: '', pass: '' }` to some
  // SMTP servers is treated as a (failing) auth attempt rather than "no
  // auth" — see email.service.ts.
  smtpHost: process.env.SMTP_HOST ?? 'localhost',
  smtpPort: parseInt(process.env.SMTP_PORT ?? '1025', 10),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  smtpFromEmail: process.env.SMTP_FROM_EMAIL ?? 'noreply@multihub.dev',
  smtpFromName: process.env.SMTP_FROM_NAME ?? 'MultiHub',

  // ── Dapr ─────────────────────────────────────────────────────────────
  daprEnabled: process.env.DAPR_ENABLED !== 'false',
  daprHttpPort: parseInt(process.env.DAPR_HTTP_PORT ?? '3500', 10),
  daprGrpcPort: parseInt(process.env.DAPR_GRPC_PORT ?? '50001', 10),
  daprAppId: process.env.DAPR_APP_ID ?? 'multihub-backend',

  // ── URLs ─────────────────────────────────────────────────────────────
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  baseUrl: process.env.BASE_URL ?? 'http://localhost:3001',

  // ── Platform ─────────────────────────────────────────────────────────
  platformCommissionPercent: parseFloat(process.env.PLATFORM_COMMISSION_PERCENT ?? '30'),
  dictionaryVersion: parseInt(process.env.DICTIONARY_VERSION ?? '1', 10),
  adminInviteExpirationHours: parseInt(process.env.ADMIN_INVITE_EXPIRATION_HOURS ?? '24', 10),

  // ── BullMQ / Outbox ──────────────────────────────────────────────────
  bullmqConcurrency: parseInt(process.env.BULLMQ_CONCURRENCY ?? '2', 10),
  outboxPollIntervalMs: parseInt(process.env.OUTBOX_POLL_INTERVAL_MS ?? '500', 10),
  outboxBatchSize: parseInt(process.env.OUTBOX_BATCH_SIZE ?? '50', 10),

  // ── Logging (Pino) / Metrics ─────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL ?? 'info',
  logPretty: process.env.LOG_PRETTY === 'true',
  // Metrics are served on the same port as the rest of the app (GET
  // /metrics on `port` above) — deliberately no separate METRICS_PORT, to
  // avoid a config option that doesn't correspond to any real listener.
  metricsEnabled: process.env.METRICS_ENABLED !== 'false',

  // ── OpenTelemetry ────────────────────────────────────────────────────
  otelEnabled: process.env.OTEL_ENABLED === 'true',
  otelExporterOtlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318',
  otelServiceName: process.env.OTEL_SERVICE_NAME ?? 'multihub-backend',
} as const;

export type Env = typeof env;
