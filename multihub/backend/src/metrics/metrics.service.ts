import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';

// Blueprint §7.5 — Prometheus metrics. One shared Registry, instrumented
// from a handful of cross-cutting call sites (HTTP middleware, outbox
// relay, Dapr publish, recommender) rather than every single handler, to
// keep this tractable while still covering the metric families the
// blueprint calls out by name.
@Injectable()
export class MetricsService {
  readonly registry = new client.Registry();

  readonly httpRequestsTotal = new client.Counter({
    name: 'multihub_http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  readonly httpRequestDurationMs = new client.Histogram({
    name: 'multihub_http_request_duration_ms',
    help: 'HTTP request duration in ms',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [this.registry],
  });

  readonly outboxEventsPublishedTotal = new client.Counter({
    name: 'multihub_outbox_events_published_total',
    help: 'Total OutboxEvent rows successfully published',
    labelNames: ['aggregate_type', 'topic'] as const,
    registers: [this.registry],
  });

  readonly daprPublishDurationMs = new client.Histogram({
    name: 'multihub_dapr_publish_duration_ms',
    help: 'Duration of Dapr pubsub.publish() calls in ms',
    labelNames: ['topic', 'component'] as const,
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
    registers: [this.registry],
  });

  readonly recommendationComputeDurationMs = new client.Histogram({
    name: 'multihub_recommendation_compute_duration_ms',
    help: 'Duration of hybrid recommendation computation in ms',
    labelNames: ['type'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
    registers: [this.registry],
  });

  readonly emailsSentTotal = new client.Counter({
    name: 'multihub_emails_sent_total',
    help: 'Total emails sent (or attempted) via MailHog',
    labelNames: ['template'] as const,
    registers: [this.registry],
  });

  constructor() {
    client.collectDefaultMetrics({ register: this.registry, prefix: 'multihub_process_' });
  }
}
