import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { env } from '../../config/env';
import { PinoLoggerService } from '../logger/pino-logger.service';

export interface CertificateJobData {
  userId: string;
  courseId: string;
  enrollmentId?: string;
}

@Injectable()
export class CertificateQueueService implements OnModuleDestroy {
  readonly queue = new Queue<CertificateJobData>('certificate-generation', {
    connection: { host: env.redisHost, port: env.redisPort },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  constructor(private readonly logger: PinoLoggerService) {}

  async enqueueCertificateGeneration(data: CertificateJobData): Promise<void> {
    await this.queue.add('generate', data);
    this.logger.log(`enqueued certificate generation for user=${data.userId} course=${data.courseId}`, 'CertificateQueueService');
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
