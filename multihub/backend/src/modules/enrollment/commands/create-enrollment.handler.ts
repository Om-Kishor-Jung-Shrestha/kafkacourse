import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailService } from '../../../common/email/email.service';

// Used directly for free courses; paid courses go through the payment webhook (§25.5).
@Injectable()
export class CreateEnrollmentHandler {
  constructor(private prisma: PrismaService, private email: EmailService) {}

  async execute(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, include: { creator: true } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.status !== 'PUBLISHED') throw new BadRequestException('Course not available');
    if (course.priceCents > 0) throw new BadRequestException('Paid course requires checkout');

    const existing = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
    if (existing) throw new ConflictException('Already enrolled');

    const enrollment = await this.prisma.$transaction(async (tx) => {
      const e = await tx.enrollment.create({ data: { userId, courseId, status: 'ACTIVE', progress: 0 } });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Enrollment',
          aggregateId: e.id,
          eventType: 'EnrollmentCreatedEvent',
          payload: { userId, courseId },
          topic: 'enrollment.created',
          component: 'durable',
        },
      });
      return e;
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.email.sendEnrollmentConfirmation(user.email, course.title);
    return enrollment;
  }
}
