import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Per-lesson progress (UserLessonProgress) -> derived Enrollment.progress.
 * Progress = completed published lessons / total published lessons, so the
 * course player can persist exactly which lessons a learner finished.
 */
@Injectable()
export class LessonProgressHandler {
  constructor(private prisma: PrismaService) {}

  /** Enrollments with everything the "My learning" page needs in one query. */
  async myEnrollments(userId: string) {
    const rows = await this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            creator: { select: { firstName: true, lastName: true } },
            sections: { include: { lessons: { where: { isPublished: true }, select: { id: true, durationSeconds: true } } } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    const done = rows.length
      ? await this.prisma.userLessonProgress.groupBy({
          by: ['enrollmentId'],
          where: { enrollmentId: { in: rows.map((r) => r.id) }, isCompleted: true },
          _count: { _all: true },
        })
      : [];
    const doneByEnrollment = new Map(done.map((d) => [d.enrollmentId, d._count._all]));

    return rows.map((e) => {
      const { sections, creator, ...course } = e.course;
      const lessons = sections.flatMap((s) => s.lessons);
      return {
        ...e,
        course: { ...course, creatorName: [creator.firstName, creator.lastName].filter(Boolean).join(' ') },
        lessonCount: lessons.length,
        totalSeconds: lessons.reduce((sum, l) => sum + l.durationSeconds, 0),
        completedCount: doneByEnrollment.get(e.id) ?? 0,
      };
    });
  }

  /** Full course content (incl. video URLs/lesson text) for an enrolled learner. */
  async learn(enrollmentId: string, userId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        course: {
          include: {
            creator: { select: { firstName: true, lastName: true, avatarUrl: true } },
            sections: {
              orderBy: { order: 'asc' },
              include: { lessons: { where: { isPublished: true }, orderBy: { order: 'asc' } } },
            },
            resources: true,
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.userId !== userId) throw new ForbiddenException('Not your enrollment');
    if (enrollment.status === 'REFUNDED') throw new ForbiddenException('This enrollment was refunded');

    const done = await this.prisma.userLessonProgress.findMany({
      where: { enrollmentId, isCompleted: true },
      select: { lessonId: true },
    });
    const { course, ...enr } = enrollment;
    return { enrollment: enr, course, completedLessonIds: done.map((d) => d.lessonId) };
  }

  async setCompleted(enrollmentId: string, lessonId: string, userId: string, completed: boolean) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { include: { sections: { include: { lessons: { where: { isPublished: true }, select: { id: true } } } } } } },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.userId !== userId) throw new ForbiddenException('Not your enrollment');
    if (enrollment.status === 'REFUNDED' || enrollment.status === 'DROPPED') {
      throw new ForbiddenException('This enrollment is not active');
    }

    const lessonIds = enrollment.course.sections.flatMap((s) => s.lessons.map((l) => l.id));
    if (!lessonIds.includes(lessonId)) throw new BadRequestException('Lesson does not belong to this course');

    return this.prisma.$transaction(async (tx) => {
      await tx.userLessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        update: { isCompleted: completed, completedAt: completed ? new Date() : null },
        create: { userId, lessonId, enrollmentId, isCompleted: completed, completedAt: completed ? new Date() : null },
      });

      const doneRows = await tx.userLessonProgress.findMany({
        where: { enrollmentId, isCompleted: true, lessonId: { in: lessonIds } },
        select: { lessonId: true },
      });
      const progress = lessonIds.length ? doneRows.length / lessonIds.length : 0;
      const isComplete = lessonIds.length > 0 && progress >= 1;
      const justCompleted = isComplete && enrollment.status !== 'COMPLETED';

      const updated = await tx.enrollment.update({
        where: { id: enrollmentId },
        data: {
          progress,
          status: isComplete ? 'COMPLETED' : enrollment.status === 'COMPLETED' ? 'ACTIVE' : enrollment.status,
          completedAt: isComplete ? enrollment.completedAt ?? new Date() : null,
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Enrollment',
          aggregateId: enrollmentId,
          eventType: justCompleted ? 'EnrollmentCompletedEvent' : 'ProgressUpdatedEvent',
          payload: { enrollmentId, userId, courseId: enrollment.courseId, progress },
          topic: justCompleted ? 'enrollment.completed' : 'progress.updated',
          component: justCompleted ? 'durable' : 'immediate',
        },
      });

      return {
        progress: updated.progress,
        status: updated.status,
        completedAt: updated.completedAt,
        completedLessonIds: doneRows.map((d) => d.lessonId),
      };
    });
  }
}
