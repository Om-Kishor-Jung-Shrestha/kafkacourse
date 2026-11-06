import { Module } from '@nestjs/common';
import { EnrollmentController, CertificateController } from './enrollment.controller';
import { CertificateService } from './certificate.service';
import { CreateEnrollmentHandler } from './commands/create-enrollment.handler';
import { UpdateProgressHandler } from './commands/update-progress.handler';
import { LessonProgressHandler } from './commands/lesson-progress.handler';

@Module({
  controllers: [EnrollmentController, CertificateController],
  providers: [CreateEnrollmentHandler, UpdateProgressHandler, LessonProgressHandler, CertificateService],
})
export class EnrollmentModule {}
