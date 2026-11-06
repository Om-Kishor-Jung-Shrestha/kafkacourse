import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Certificate of completion. The code is derived from the enrollment id, so it can be verified publicly without extra storage. */
@Injectable()
export class CertificateService {
  constructor(private prisma: PrismaService) {}

  codeFor(enrollmentId: string) {
    return `MH-${enrollmentId.slice(-10).toUpperCase()}`;
  }

  private async build(enrollment: any) {
    const [user, course] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: enrollment.userId }, select: { firstName: true, lastName: true, email: true } }),
      this.prisma.course.findUnique({
        where: { id: enrollment.courseId },
        include: {
          creator: { select: { firstName: true, lastName: true } },
          sections: { include: { lessons: { where: { isPublished: true }, select: { durationSeconds: true } } } },
        },
      }),
    ]);
    const lessons = course?.sections.flatMap((s) => s.lessons) ?? [];
    return {
      code: this.codeFor(enrollment.id),
      studentName: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Learner',
      courseTitle: course?.title ?? 'Course',
      instructorName: [course?.creator.firstName, course?.creator.lastName].filter(Boolean).join(' '),
      completedAt: enrollment.completedAt,
      lessonCount: lessons.length,
      totalSeconds: lessons.reduce((a, l) => a + l.durationSeconds, 0),
    };
  }

  async forEnrollment(enrollmentId: string, userId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.userId !== userId) throw new ForbiddenException('Not your enrollment');
    if (enrollment.status !== 'COMPLETED') throw new ForbiddenException('Finish every lesson to earn your certificate');
    return this.build(enrollment);
  }

  /** Public: anyone can check that a certificate code is genuine. */
  async verify(rawCode: string) {
    const suffix = rawCode.trim().toUpperCase().replace(/^MH-/, '').toLowerCase();
    if (!/^[a-z0-9]{6,12}$/.test(suffix)) throw new NotFoundException('Certificate not found');
    const enrollment = await this.prisma.enrollment.findFirst({ where: { id: { endsWith: suffix }, status: 'COMPLETED' } });
    if (!enrollment) throw new NotFoundException('Certificate not found');
    return this.build(enrollment);
  }
}
