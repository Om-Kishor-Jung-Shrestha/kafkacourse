import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { PinoLoggerService } from '../logger/pino-logger.service';
import { MetricsService } from '../../metrics/metrics.service';
import { env } from '../../config/env';

/**
 * Outbox Relay (blueprint §11.3). In production with real Dapr this would be
 * a Dapr Cron binding subscriber; here it's a 500ms poller that reads
 * pending OutboxEvent rows and publishes them via EventBusService (which
 * itself talks to the real Dapr sidecar). The transactional-outbox
 * guarantee (RULE-02/RULE-25) is preserved: nothing is "published" until the
 * DB row + event exist together in one transaction.
 */
@Injectable()
export class OutboxRelayService implements OnModuleInit {
  private readonly BATCH_SIZE = env.outboxBatchSize;
  private readonly POLL_INTERVAL_MS = env.outboxPollIntervalMs;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventBusService,
    private readonly logger: PinoLoggerService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.relay().catch((err) =>
        this.logger.error(`outbox relay tick failed: ${(err as Error).message}`, (err as Error).stack, 'OutboxRelayService'),
      );
    }, this.POLL_INTERVAL_MS);
  }

  async relay(): Promise<void> {
    const batch = await this.prisma.outboxEvent.findMany({
      where: { published: false },
      orderBy: { timestamp: 'asc' },
      take: this.BATCH_SIZE,
    });
    if (!batch.length) return;

    const publishedIds: string[] = [];
    for (const event of batch) {
      try {
        await this.bus.publish(event.component as 'immediate' | 'durable', event.topic, {
          id: event.id,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          payload: event.payload as Record<string, any>,
          topic: event.topic,
          component: event.component as 'immediate' | 'durable',
          occurredAt: event.timestamp.toISOString(),
        });
        publishedIds.push(event.id);
        this.metrics.outboxEventsPublishedTotal.inc({ aggregate_type: event.aggregateType, topic: event.topic });
      } catch (err) {
        this.logger.error(
          `outbox publish failed for ${event.id} (${event.topic}): ${(err as Error).message}`,
          (err as Error).stack,
          'OutboxRelayService',
        );
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { retryCount: { increment: 1 } },
        });
      }
    }
    if (publishedIds.length) {
      await this.prisma.outboxEvent.updateMany({
        where: { id: { in: publishedIds } },
        data: { published: true, publishedAt: new Date() },
      });
    }
  }
}
