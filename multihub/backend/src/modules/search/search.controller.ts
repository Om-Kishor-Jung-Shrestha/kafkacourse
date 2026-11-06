import { Controller, Get, Query } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import * as crypto from 'crypto';

class SearchCoursesQueryDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']) level?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsIn(['newest', 'popular', 'rating', 'price_asc', 'price_desc']) sort?: string = 'newest';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}

// §20 — full-text-ish search over RmCourseCatalog (denormalized read model),
// with a short Redis cache per unique parameter combination.
@Controller('api/search')
export class SearchController {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  @Get('courses')
  async search(@Query() query: SearchCoursesQueryDto) {
    const cacheKey = `course_search:${crypto.createHash('sha256').update(JSON.stringify(query)).digest('hex')}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const where: any = { status: 'PUBLISHED' };
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
        { category: { contains: query.q, mode: 'insensitive' } },
        { tags: { has: query.q.toLowerCase() } },
      ];
    }
    if (query.category) where.category = query.category;
    if (query.level) where.level = query.level;
    if (query.language) where.language = query.language;
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.priceCents = {};
      if (query.minPrice !== undefined) where.priceCents.gte = query.minPrice;
      if (query.maxPrice !== undefined) where.priceCents.lte = query.maxPrice;
    }

    const orderBy: any =
      query.sort === 'popular' ? { enrollmentCount: 'desc' }
      : query.sort === 'rating' ? { averageRating: 'desc' }
      : query.sort === 'price_asc' ? { priceCents: 'asc' }
      : query.sort === 'price_desc' ? { priceCents: 'desc' }
      : { publishedAt: 'desc' };

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.rmCourseCatalog.findMany({ where, orderBy, take: limit, skip: (page - 1) * limit }),
      this.prisma.rmCourseCatalog.count({ where }),
    ]);

    const result = { data, total, page };
    await this.redis.setex(cacheKey, 120, JSON.stringify(result));
    return result;
  }

  @Get('suggestions')
  async suggestions(@Query('q') q: string) {
    if (!q || q.length < 2) return [];
    const cacheKey = `suggestions:${q.toLowerCase()}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const rows = await this.prisma.rmCourseCatalog.findMany({
      where: { status: 'PUBLISHED', title: { contains: q, mode: 'insensitive' } },
      select: { id: true, title: true, slug: true },
      take: 8,
    });
    await this.redis.setex(cacheKey, 60, JSON.stringify(rows));
    return rows;
  }
}
