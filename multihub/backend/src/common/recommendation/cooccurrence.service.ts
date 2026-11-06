import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * §18.4 — collaborative filtering via a course co-occurrence matrix built from
 * enrollment patterns: two courses "co-occur" when the same user enrolled in
 * both. We store pairwise co-occurrence counts + Jaccard similarity so that
 * "students who took A also took B" recommendations can be served with a
 * simple lookup instead of recomputing over all enrollments per request.
 */
@Injectable()
export class CooccurrenceService {
  constructor(private prisma: PrismaService) {}

  async rebuildMatrix(): Promise<void> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: { userId: true, courseId: true },
    });

    const userCourses = new Map<string, Set<string>>();
    for (const { userId, courseId } of enrollments) {
      if (!userCourses.has(userId)) userCourses.set(userId, new Set());
      userCourses.get(userId)!.add(courseId);
    }

    const courseEnrollers = new Map<string, number>();
    for (const courseSet of userCourses.values()) {
      for (const courseId of courseSet) {
        courseEnrollers.set(courseId, (courseEnrollers.get(courseId) ?? 0) + 1);
      }
    }

    const coCount = new Map<string, number>();
    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

    for (const courseSet of userCourses.values()) {
      const courses = [...courseSet];
      for (let i = 0; i < courses.length; i++) {
        for (let j = i + 1; j < courses.length; j++) {
          const key = pairKey(courses[i], courses[j]);
          coCount.set(key, (coCount.get(key) ?? 0) + 1);
        }
      }
    }

    for (const [key, count] of coCount.entries()) {
      const [a, b] = key.split('|');
      const union = (courseEnrollers.get(a) ?? 0) + (courseEnrollers.get(b) ?? 0) - count;
      const jaccard = union > 0 ? count / union : 0;
      await this.prisma.courseCooccurrence.upsert({
        where: { courseIdA_courseIdB: { courseIdA: a, courseIdB: b } },
        create: { courseIdA: a, courseIdB: b, coCount: count, jaccard },
        update: { coCount: count, jaccard },
      });
    }
  }

  async getCollaborativePicks(enrolledCourseIds: string[], topN = 30): Promise<string[]> {
    if (!enrolledCourseIds.length) return [];
    const pairs = await this.prisma.courseCooccurrence.findMany({
      where: {
        OR: [{ courseIdA: { in: enrolledCourseIds } }, { courseIdB: { in: enrolledCourseIds } }],
      },
      orderBy: { jaccard: 'desc' },
      take: 200,
    });

    const enrolled = new Set(enrolledCourseIds);
    const scores = new Map<string, number>();
    for (const pair of pairs) {
      const other = enrolled.has(pair.courseIdA) ? pair.courseIdB : pair.courseIdA;
      if (enrolled.has(other)) continue;
      scores.set(other, (scores.get(other) ?? 0) + pair.jaccard);
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([id]) => id);
  }
}
