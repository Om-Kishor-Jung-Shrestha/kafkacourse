import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PinoLoggerService } from '../logger/pino-logger.service';
import { CertificateJobData } from './certificate-queue.service';

/**
 * BullMQ worker — processes certificate-generation jobs enqueued by
 * CertificateQueueService. Simulates PDF generation (the blueprint specifies
 * PDFKit for this; kept as a stub here to avoid pulling in a PDF-rendering
 * dependency for a demo asset) and sends the "certificate issued" email.
 * Retries (3 attempts, exponential backoff) are handled entirely by BullMQ —
 * this never touches Dapr/Outbox, per RULE-22's "local jobs only" carve-out.
 */
@Injectable()
export class CertificateWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<CertificateJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly logger: PinoLoggerService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<CertificateJobData>(
      'certificate-generation',
      async (job: Job<CertificateJobData>) => this.process(job),
      { connection: { host: env.redisHost, port: env.redisPort }, concurrency: env.bullmqConcurrency },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`certificate job ${job.id} completed for user=${job.data.userId}`, 'CertificateWorker');
    });
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `certificate job ${job?.id} failed for user=${job?.data.userId}: ${err.message}`,
        err.stack,
        'CertificateWorker',
      );
    });
  }

  private async process(job: Job<CertificateJobData>): Promise<void> {
    const { userId, courseId } = job.data;
    const [user, course] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.course.findUnique({ where: { id: courseId } }),
    ]);
    if (!user || !course) return;

    // Simulated PDF generation — a real implementation renders a PDF via
    // PDFKit here and uploads it through the StorageService (RULE-12).
    await new Promise((resolve) => setTimeout(resolve, 250));

    await this.email.send(
      user.email,
      `Your certificate for ${course.title} is ready!`,
      `<p>Congratulations on completing <b>${course.title}</b>! Your certificate is attached (simulated).</p>`,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
