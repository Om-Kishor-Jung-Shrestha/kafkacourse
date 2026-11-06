import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { EventBusService } from './event-bus.service';
import { PinoLoggerService } from '../logger/pino-logger.service';

/**
 * Implements the Dapr "programming model" HTTP contract (blueprint §11.6):
 *  - GET  /dapr/subscribe          → tells the Dapr sidecar which topics
 *                                     (Redis Streams / Kafka) this app wants.
 *  - POST /dapr/events/:topic      → the Dapr sidecar calls this route to
 *                                     deliver a message it received off
 *                                     Redis Streams or Kafka. We unwrap the
 *                                     CloudEvents envelope and hand the
 *                                     original payload to the in-process
 *                                     subscriber(s) registered for that topic
 *                                     (projectors, workers, etc).
 *
 * Always returns 200 with { status: 'SUCCESS' } even if a subscriber threw —
 * EventBusService.deliverLocally() already isolates per-handler failures, so
 * a broken projector never turns into a 500 here or an infinite Dapr retry
 * loop for an event that was actually handled by other subscribers.
 */
@Controller('dapr')
export class DaprController {
  constructor(private readonly bus: EventBusService, private readonly logger: PinoLoggerService) {}

  @Get('subscribe')
  subscribe() {
    return this.bus.getSubscriptionManifest();
  }

  @Post('events/:topic')
  @HttpCode(200)
  async handleEvent(@Param('topic') topic: string, @Body() body: any) {
    // Dapr wraps published payloads in a CloudEvents envelope; the value we
    // originally published is under body.data.
    const event = body?.data ?? body;
    this.logger.debug(`received via Dapr ← ${topic}`, 'DaprController');
    await this.bus.deliverLocally(topic, event);
    return { status: 'SUCCESS' };
  }
}
