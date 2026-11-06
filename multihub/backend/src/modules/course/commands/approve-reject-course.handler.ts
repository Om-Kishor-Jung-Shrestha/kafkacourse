import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailService } from '../../../common/email/email.service';
import { CourseMapper } from '../../../common/mappers/course.mapper';

@Injectable()
export class ApproveRejectCourseHandler {
  constructor(private prisma: PrismaService, private email: EmailService) {}

  async approve(courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, include: { creator: true } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.status !== 'PENDING_REVIEW') throw new ConflictException('Course not pending review');

    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.course.update({
        where: { id: courseId },
        data: { status: 'PUBLISHED', publishedAt: new Date(), rejectionReason: null },
        include: { creator: true },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Course',
          aggregateId: courseId,
          eventType: 'CoursePublishedEvent',
          payload: { courseId, creatorId: c.creatorId, creatorEmail: c.creator.email, title: c.title },
          topic: 'course.published',
          component: 'durable',
        },
      });
      return c;
    });

    await this.email.sendCourseApproved(course.creator.email, course.title);
    return CourseMapper.toDto(updated);
  }

  async reject(courseId: string, reason: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.status !== 'PENDING_REVIEW') throw new ConflictException('Course not pending review');

    return this.prisma.$transaction(async (tx) => {
      const c = await tx.course.update({ where: { id: courseId }, data: { status: 'REJECTED', rejectionReason: reason } });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Course',
          aggregateId: courseId,
          eventType: 'CourseRejectedEvent',
          payload: { courseId, reason },
          topic: 'course.rejected',
          component: 'durable',
        },
      });
      return CourseMapper.toDto(c);
    });
  }
}
