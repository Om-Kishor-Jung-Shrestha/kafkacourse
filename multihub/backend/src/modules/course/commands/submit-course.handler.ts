import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class SubmitCourseHandler {
  constructor(private prisma: PrismaService) {}

  async execute(courseId: string, creatorId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, include: { sections: { include: { lessons: true } } } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.creatorId !== creatorId) throw new ForbiddenException('Not your course');
    if (course.status !== 'DRAFT' && course.status !== 'REJECTED') throw new ConflictException('Only draft or rejected courses can be submitted for review');
    if (!course.sections.length || !course.sections.some((s) => s.lessons.length)) {
      throw new BadRequestException('Course must have at least one section with a lesson');
    }

    return this.prisma.$transaction(async (tx) => {
      const c = await tx.course.update({ where: { id: courseId }, data: { status: 'PENDING_REVIEW', rejectionReason: null } });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Course',
          aggregateId: courseId,
          eventType: 'CoursePendingReviewEvent',
          payload: { courseId },
          topic: 'course.pending_review',
          component: 'durable',
        },
      });
      return c;
    });
  }
}
