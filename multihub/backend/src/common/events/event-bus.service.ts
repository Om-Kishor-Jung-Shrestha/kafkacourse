import { Injectable } from '@nestjs/common';
import { env } from '../../config/env';
import { PinoLoggerService } from '../logger/pino-logger.service';
import { MetricsService } from '../../metrics/metrics.service';

export interface DomainEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, any>;
  topic: string;
  component: 'immediate' | 'durable';
  occurredAt: string;
}

type Handler = (event: DomainEvent) => Promise<void> | void;

const COMPONENT_NAME: Record<'immediate' | 'durable', string> = {
  immediate: 'pubsub.immediate', // Dapr component backed by Redis Streams
  durable: 'pubsub.durable', // Dapr component backed by Kafka
};

// Appendix A of the blueprint — which Dapr component each topic is routed
// through. Used to build the /dapr/subscribe manifest correctly per topic.
const ROUTING_TABLE: Record<string, 'immediate' | 'durable'> = {
  'user.registered': 'durable',
  'user.login': 'immediate',
  'user.promoted': 'durable',
  'course.created': 'durable',
  'course.published': 'durable',
  'course.rejected': 'durable',
  'course.pending_review': 'durable',
  'course.updated': 'durable',
  'course.archived': 'durable',
  'enrollment.created': 'durable',
  'enrollment.completed': 'durable',
  'progress.updated': 'immediate',
  'payment.completed': 'durable',
  'payment.refunded': 'durable',
  'payment.checkout.created': 'durable',
  'payout.requested': 'durable',
  'payout.processed': 'durable',
  'review.created': 'durable',
  'notification.created': 'immediate',
  'cache.invalidate': 'immediate',
};

/**
 * Publishes/subscribes to domain events through the real Dapr pub/sub API
 * (blueprint §11/§13): `component: 'immediate'` routes through the
 * pubsub.immediate Dapr component (Redis Streams — low latency, 24h
 * MAXLEN-capped retention); `component: 'durable'` routes through
 * pubsub.durable (Kafka — 30/90d retention, replayable, at-least-once).
 *
 * publish() calls the Dapr sidecar's HTTP publish endpoint:
 *   POST http://localhost:{DAPR_HTTP_PORT}/v1.0/publish/{pubsubName}/{topic}
 * Dapr then asynchronously delivers the message back to *this same app* over
 * HTTP at /dapr/events/{topic} (registered via the /dapr/subscribe manifest —
 * see DaprController), which invokes whichever handlers were registered here
 * with subscribe(). This is the real cross-module asynchronous path: a
 * CommandHandler in one module publishes; a Projector or worker in a totally
 * different module reacts, decoupled through Redis Streams / Kafka — not a
 * direct function call.
 *
 * If no Dapr sidecar is reachable (e.g. running the backend outside of
 * `docker compose up`, where the `backend-dapr` sidecar container isn't
 * present), publish() falls back to delivering the event in-process so the
 * app still boots and works for quick iteration — but for real
 * asynchronous, durable, replayable delivery across modules via Redis
 * Streams/Kafka, run the full stack via `docker compose up --build`.
 */
@Injectable()
export class EventBusService {
  private readonly subscribers = new Map<string, Handler[]>();

  constructor(private readonly logger: PinoLoggerService, private readonly metrics: MetricsService) {}

  async publish(component: 'immediate' | 'durable', topic: string, event: DomainEvent): Promise<void> {
    if (!env.daprEnabled) {
      await this.deliverLocally(topic, event);
      return;
    }

    const pubsubName = COMPONENT_NAME[component];
    const url = `http://localhost:${env.daprHttpPort}/v1.0/publish/${pubsubName}/${topic}`;
    const start = process.hrtime.bigint();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      this.metrics.daprPublishDurationMs.observe({ topic, component }, durationMs);
      this.logger.debug(`published via Dapr → [${pubsubName}] ${topic}`, 'EventBusService');
    } catch (err) {
      this.logger.warn(
        `Dapr sidecar unreachable for [${pubsubName}] ${topic} (${(err as Error).message}); ` +
          `delivering in-process instead. Run "docker compose up" so the Dapr sidecar is available for real Redis Streams/Kafka delivery.`,
        'EventBusService',
      );
      await this.deliverLocally(topic, event);
    }
  }

  subscribe(topic: string, handler: Handler): void {
    const list = this.subscribers.get(topic) ?? [];
    list.push(handler);
    this.subscribers.set(topic, list);
  }

  /** Invoked by DaprController when the Dapr sidecar delivers a message back
   *  to us, and as the local fallback path when Dapr isn't running. */
  async deliverLocally(topic: string, event: DomainEvent): Promise<void> {
    const handlers = this.subscribers.get(topic) ?? [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        // A failing subscriber must never crash the process or bubble up as
        // a 500 on an unrelated request — log and move on to the next handler.
        this.logger.error(
          `subscriber failed for topic ${topic}: ${(err as Error).message}`,
          (err as Error).stack,
          'EventBusService',
        );
      }
    }
  }

  /** GET /dapr/subscribe manifest — tells the Dapr sidecar which topics (and
   *  which pubsub component, Redis Streams vs Kafka) this app subscribes to. */
  getSubscriptionManifest(): Array<{ pubsubname: string; topic: string; route: string }> {
    return [...this.subscribers.keys()].map((topic) => ({
      pubsubname: COMPONENT_NAME[ROUTING_TABLE[topic] ?? 'durable'],
      topic,
      route: `/dapr/events/${topic}`,
    }));
  }
}
