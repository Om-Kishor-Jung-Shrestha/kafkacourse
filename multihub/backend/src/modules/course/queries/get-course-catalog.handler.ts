import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

@Injectable()
export class GetCourseCatalogHandler {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  async execute(query: { page: number; limit: number; category?: string; q?: string }) {
    const cacheKey = `catalog:${crypto.createHash('sha256').update(JSON.stringify(query)).digest('hex')}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const where: any = { status: 'PUBLISHED' };
    if (query.category) where.category = query.category;
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.rmCourseCatalog.findMany({
        where,
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.rmCourseCatalog.count({ where }),
    ]);

    const result = { data, total, page: query.page };
    await this.redis.setex(cacheKey, 120, JSON.stringify(result));
    return result;
  }
}
