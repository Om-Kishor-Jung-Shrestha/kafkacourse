import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class CreateReviewHandler {
  constructor(private prisma: PrismaService) {}

  async execute(userId: string, courseId: string, rating: number, comment?: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
    if (!enrollment) throw new ForbiddenException('Must be enrolled to review');

    const existing = await this.prisma.review.findUnique({ where: { userId_courseId: { userId, courseId } } });
    if (existing) throw new ConflictException('Already reviewed this course');

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({ data: { userId, courseId, rating, comment } });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Review',
          aggregateId: review.id,
          eventType: 'ReviewCreatedEvent',
          payload: { reviewId: review.id, courseId, rating },
          topic: 'review.created',
          component: 'durable',
        },
      });
      return review;
    });
  }
}
