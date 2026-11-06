import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LevelKey } from './dictionary';

// §18.3 — builds a per-user "taste profile" from their enrollment history,
// weighted by how far they progressed in each course.
@Injectable()
export class VectorService {
  constructor(private prisma: PrismaService) {}

  async computeUserProfile(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      include: { course: true },
    });
    if (!enrollments.length) return null;

    const catCounts: Record<string, number> = {};
    const lvlCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    const langCounts: Record<string, number> = {};
    let totalPriceWeight = 0;
    let totalWeightCount = 0;

    for (const e of enrollments) {
      const c = e.course;
      const weight = e.progress > 0.8 ? 1.5 : e.progress > 0.3 ? 1.0 : 0.5;
      totalWeightCount += weight;
      totalPriceWeight += c.priceCents * weight;
      catCounts[c.category] = (catCounts[c.category] ?? 0) + weight;
      lvlCounts[c.level] = (lvlCounts[c.level] ?? 0) + weight;
      langCounts[c.language] = (langCounts[c.language] ?? 0) + weight;
      for (const tag of c.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + weight;
    }

    const priceTierFromCents = (await import('./dictionary')).priceTierFromCents;

    return {
      categoryWeights: this.normalize(catCounts),
      levelWeights: this.normalize(lvlCounts) as Record<LevelKey, number>,
      tagWeights: this.normalize(tagCounts),
      languageScores: this.normalize(langCounts),
      priceTierPreference: priceTierFromCents(totalWeightCount > 0 ? totalPriceWeight / totalWeightCount : 0),
      enrolledCourseIds: enrollments.map((e) => e.courseId),
    };
  }

  private normalize(obj: Record<string, number>): Record<string, number> {
    const sum = Object.values(obj).reduce((a, b) => a + b, 0) || 1;
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v / sum]));
  }
}
