// OpenTelemetry bootstrap — must be required/imported BEFORE anything else
// (including main.ts's own imports) so auto-instrumentation can patch
// modules like http, express, pg, ioredis before they're first required.
// Only actually starts when OTEL_ENABLED=true; otherwise this is a no-op so
// nobody is forced to run an OTel collector to boot the app.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const otelEnabled = process.env.OTEL_ENABLED === 'true';

if (otelEnabled) {
  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'multihub-backend';
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318';

  const sdk = new NodeSDK({
    resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [getNodeAutoInstrumentations({
      // Reduce noise: skip fs instrumentation (extremely chatty, low value).
      '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
  });

  try {
    sdk.start();
    // eslint-disable-next-line no-console
    console.log(`[otel] tracing started -> ${endpoint} (service: ${serviceName})`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[otel] failed to start tracing SDK, continuing without it:', (err as Error).message);
  }

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
