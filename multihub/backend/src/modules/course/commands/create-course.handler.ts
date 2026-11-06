import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CourseMapper } from '../../../common/mappers/course.mapper';

@Injectable()
export class CreateCourseHandler {
  constructor(private prisma: PrismaService) {}

  async execute(creatorId: string, dto: { title: string; description: string; priceCents: number; level: string; category: string; tags: string[]; language?: string; subtitle?: string; learningOutcomes?: string[]; requirements?: string[] }) {
    const baseSlug = this.slugify(dto.title);
    let slug = baseSlug;
    let suffix = 1;
    while (await this.prisma.course.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const course = await this.prisma.$transaction(async (tx) => {
      const newCourse = await tx.course.create({
        data: {
          creatorId,
          title: dto.title,
          slug,
          description: dto.description,
          priceCents: dto.priceCents,
          level: dto.level as any,
          category: dto.category,
          tags: dto.tags,
          language: dto.language ?? 'en',
          subtitle: dto.subtitle?.trim() || null,
          learningOutcomes: cleanList(dto.learningOutcomes),
          requirements: cleanList(dto.requirements),
          status: 'DRAFT',
        },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Course',
          aggregateId: newCourse.id,
          eventType: 'CourseCreatedEvent',
          payload: { courseId: newCourse.id, creatorId, title: dto.title, slug },
          topic: 'course.created',
          component: 'durable',
        },
      });
      return newCourse;
    });

    return CourseMapper.toDto(course);
  }

  private slugify(s: string): string {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
}

function cleanList(list?: string[]): string[] {
  return (list ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 12);
}
