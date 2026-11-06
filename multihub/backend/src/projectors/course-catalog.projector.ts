import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { EventBusService, DomainEvent } from '../common/events/event-bus.service';
import { PinoLoggerService } from '../common/logger/pino-logger.service';

// §27 — Projectors are the ONLY writers of rm_* tables (RULE-05). Idempotent
// upserts keyed by aggregate id; invalidates Redis cache after every write.
@Injectable()
export class CourseCatalogProjector implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private bus: EventBusService,
    private logger: PinoLoggerService,
  ) {}

  onModuleInit() {
    this.bus.subscribe('course.created', (e) => this.projectFromEvent(e));
    this.bus.subscribe('course.published', (e) => this.projectFromEvent(e));
    this.bus.subscribe('course.updated', (e) => this.projectFromEvent(e));
    this.bus.subscribe('course.archived', (e) => this.projectFromEvent(e));
    this.bus.subscribe('review.created', (e) => this.projectFromEvent(e));
    this.bus.subscribe('enrollment.created', (e) => this.projectFromEvent(e));
  }

  private async projectFromEvent(event: DomainEvent): Promise<void> {
    const courseId = event.payload.courseId as string | undefined;
    if (!courseId) return;
    await this.projectCourse(courseId);
  }

  private async projectCourse(courseId: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { creator: true, reviews: true, _count: { select: { enrollments: true } } },
    });
    if (!course) return;

    const avgRating = course.reviews.length ? course.reviews.reduce((s, r) => s + r.rating, 0) / course.reviews.length : 0;

    await this.prisma.rmCourseCatalog.upsert({
      where: { id: course.id },
      create: {
        id: course.id,
        creatorId: course.creatorId,
        creatorName: `${course.creator.firstName ?? ''} ${course.creator.lastName ?? ''}`.trim(),
        title: course.title,
        slug: course.slug,
        description: course.description,
        thumbnailUrl: course.thumbnailUrl,
        priceCents: course.priceCents,
        level: course.level,
        category: course.category,
        tags: course.tags,
        language: course.language,
        isFeatured: course.isFeatured,
        status: course.status,
        averageRating: avgRating,
        reviewCount: course.reviews.length,
        enrollmentCount: course._count.enrollments,
        publishedAt: course.publishedAt,
      },
      update: {
        creatorName: `${course.creator.firstName ?? ''} ${course.creator.lastName ?? ''}`.trim(),
        title: course.title,
        description: course.description,
        level: course.level,
        category: course.category,
        tags: course.tags,
        language: course.language,
        thumbnailUrl: course.thumbnailUrl,
        priceCents: course.priceCents,
        status: course.status,
        averageRating: avgRating,
        reviewCount: course.reviews.length,
        enrollmentCount: course._count.enrollments,
        publishedAt: course.publishedAt,
        projectedAt: new Date(),
      },
    });
    await this.redis.del(`course:${course.slug}`);
    this.logger.debug(`projected course catalog entry for ${course.slug}`, 'CourseCatalogProjector');
  }
}
