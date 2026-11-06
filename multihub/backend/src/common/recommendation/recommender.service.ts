import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { VectorService } from './vector.service';
import { CooccurrenceService } from './cooccurrence.service';
import { cosineSimilarity } from './similarity.service';
import { DICTIONARY_VERSION, encodeCourse, LevelKey } from './dictionary';
import { MetricsService } from '../../metrics/metrics.service';

// §18.5 — hybrid recommender: 50% content-based (cosine similarity over the
// dictionary-encoded feature vectors) + 50% collaborative (co-occurrence
// matrix / "students who took X also took Y"). Falls back to popularity for
// brand-new users with no enrollment history.
@Injectable()
export class RecommenderService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private vectorService: VectorService,
    private cooccurrenceService: CooccurrenceService,
    private metrics: MetricsService,
  ) {}

  async topNPicksForUser(userId: string, n = 30): Promise<string[]> {
    const start = process.hrtime.bigint();
    try {
      return await this.computePicks(userId, n);
    } finally {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      this.metrics.recommendationComputeDurationMs.observe({ type: 'hybrid' }, durationMs);
    }
  }

  private async computePicks(userId: string, n: number): Promise<string[]> {
    let profile = await this.prisma.rmRecommendationProfile.findUnique({ where: { userId } });

    if (!profile || profile.dictionaryVersion !== DICTIONARY_VERSION) {
      const fresh = await this.vectorService.computeUserProfile(userId);
      if (!fresh) return this.popularFallback(n);
      profile = await this.prisma.rmRecommendationProfile.upsert({
        where: { userId },
        create: {
          userId,
          categoryWeights: fresh.categoryWeights,
          levelWeights: fresh.levelWeights,
          tagWeights: fresh.tagWeights,
          languageScores: fresh.languageScores,
          priceTierPreference: fresh.priceTierPreference,
          enrolledCourseIds: fresh.enrolledCourseIds,
          dictionaryVersion: DICTIONARY_VERSION,
        },
        update: {
          categoryWeights: fresh.categoryWeights,
          levelWeights: fresh.levelWeights,
          tagWeights: fresh.tagWeights,
          languageScores: fresh.languageScores,
          priceTierPreference: fresh.priceTierPreference,
          enrolledCourseIds: fresh.enrolledCourseIds,
          dictionaryVersion: DICTIONARY_VERSION,
        },
      });
    }

    const enrolled = new Set<string>(profile.enrolledCourseIds);
    const candidates = await this.prisma.rmCourseCatalog.findMany({
      where: { status: 'PUBLISHED', id: { notIn: [...enrolled] } },
      take: 500,
    });
    if (!candidates.length) return this.popularFallback(n);

    const userVector = this.profileToVector(profile as any);
    const contentScores = new Map<string, number>();
    for (const c of candidates) {
      const cv = encodeCourse({
        category: c.category,
        level: c.level as LevelKey,
        tags: c.tags,
        priceCents: c.priceCents,
        language: c.language,
      });
      contentScores.set(c.id, cosineSimilarity(userVector, cv));
    }

    const collabIds = await this.cooccurrenceService.getCollaborativePicks([...enrolled], 100);
    const collabScores = new Map<string, number>();
    collabIds.forEach((id, idx) => collabScores.set(id, 1.0 - idx / Math.max(collabIds.length, 1)));

    const hybridScores = new Map<string, number>();
    for (const c of candidates) {
      hybridScores.set(c.id, 0.5 * (contentScores.get(c.id) ?? 0) + 0.5 * (collabScores.get(c.id) ?? 0));
    }

    const picks = [...hybridScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => id);

    await this.redis.setex(`recommendations:${userId}`, 3600, JSON.stringify(picks));
    return picks;
  }

  private async popularFallback(n: number): Promise<string[]> {
    const popular = await this.prisma.rmCourseCatalog.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { enrollmentCount: 'desc' },
      take: n,
      select: { id: true },
    });
    return popular.map((c) => c.id);
  }

  private profileToVector(profile: {
    categoryWeights: Record<string, number>;
    levelWeights: Record<string, number>;
    tagWeights: Record<string, number>;
  }): Float32Array {
    const topCat = Object.entries(profile.categoryWeights).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
    const topLevel = (Object.entries(profile.levelWeights).sort((a, b) => b[1] - a[1])[0]?.[0] as LevelKey) ?? 'BEGINNER';
    const topTags = Object.entries(profile.tagWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([k]) => k);
    return encodeCourse({ category: topCat, level: topLevel, tags: topTags, priceCents: 0, language: 'en' });
  }
}
