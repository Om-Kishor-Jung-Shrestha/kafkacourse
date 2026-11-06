export class CourseMapper {
  static toDto(course: any) {
    return {
      id: course.id,
      creatorId: course.creatorId,
      title: course.title,
      slug: course.slug,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      priceCents: course.priceCents,
      status: course.status,
      level: course.level,
      category: course.category,
      tags: course.tags,
      language: course.language,
      isFeatured: course.isFeatured,
      publishedAt: course.publishedAt,
      createdAt: course.createdAt,
    };
  }
}
