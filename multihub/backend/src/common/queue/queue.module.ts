import { Global, Module, OnModuleInit } from '@nestjs/common';
import { CertificateQueueService } from './certificate-queue.service';
import { CertificateWorker } from './certificate.worker';
import { EventBusService } from '../events/event-bus.service';

/**
 * BullMQ — job queue for local, non-Dapr work (blueprint tech stack:
 * "Job Queue: BullMQ (for non-Dapr local jobs only)"). Cross-module
 * communication (course.published, payment.completed, etc.) always goes
 * through Dapr pub/sub over Redis Streams/Kafka (RULE-22) — BullMQ is
 * intentionally NOT used for that. It's for in-process background work
 * that benefits from retry/backoff/concurrency control but has no reason
 * to be a durable cross-module event: here, generating a certificate PDF
 * and emailing it once a learner completes a course.
 *
 * Both BullMQ and Dapr use the same Redis instance but for different
 * purposes — BullMQ's queue lists/streams vs Dapr's pubsub.immediate
 * (Redis Streams component) — they don't collide because they use
 * different key prefixes/data structures under the hood.
 */
@Global()
@Module({
  providers: [CertificateQueueService, CertificateWorker],
  exports: [CertificateQueueService],
})
export class QueueModule implements OnModuleInit {
  constructor(private bus: EventBusService, private certificateQueue: CertificateQueueService) {}

  onModuleInit() {
    // enrollment.completed arrives via Dapr (Redis Streams/Kafka, RULE-22);
    // reacting to it by enqueueing a BullMQ job is the deliberate hand-off
    // point between "cross-module event" and "local background job".
    this.bus.subscribe('enrollment.completed', async (event) => {
      await this.certificateQueue.enqueueCertificateGeneration({
        userId: event.payload.userId,
        courseId: event.payload.courseId,
        enrollmentId: event.payload.enrollmentId,
      });
    });
  }
}
