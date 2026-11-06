import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class UpdateProgressHandler {
  constructor(private prisma: PrismaService) {}

  async execute(enrollmentId: string, userId: string, progressPercent: number) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.userId !== userId) throw new ForbiddenException('Not your enrollment');

    const progress = progressPercent / 100;
    const isComplete = progress >= 1;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.enrollment.update({
        where: { id: enrollmentId },
        data: { progress, status: isComplete ? 'COMPLETED' : enrollment.status, completedAt: isComplete ? new Date() : enrollment.completedAt },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Enrollment',
          aggregateId: enrollmentId,
          eventType: isComplete ? 'EnrollmentCompletedEvent' : 'ProgressUpdatedEvent',
          payload: { enrollmentId, userId, courseId: enrollment.courseId, progress },
          topic: isComplete ? 'enrollment.completed' : 'progress.updated',
          component: isComplete ? 'durable' : 'immediate',
        },
      });
      return updated;
    });
  }
}
