import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class GetCourseDetailHandler {
  constructor(private prisma: PrismaService) {}

  async execute(slug: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        creator: { select: { firstName: true, lastName: true, avatarUrl: true } },
        sections: { orderBy: { order: 'asc' }, include: { lessons: { orderBy: { order: 'asc' } } } },
        reviews: { include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!course) throw new NotFoundException('Course not found');

    // Public endpoint: expose the curriculum outline only. Video URLs and
    // lesson text are served to enrolled learners via
    // GET /api/enrollments/:id/learn.
    return {
      ...course,
      sections: course.sections.map((section) => ({
        ...section,
        lessons: section.lessons
          .filter((l) => l.isPublished)
          .map(({ videoUrl, content, ...lesson }) => ({ ...lesson, hasVideo: !!videoUrl })),
      })),
    };
  }
}
