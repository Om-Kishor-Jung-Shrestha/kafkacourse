import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RecommenderService } from '../../common/recommendation/recommender.service';
import { RedisService } from '../../common/redis/redis.service';

@UseGuards(JwtAuthGuard)
@Controller('api/recommendations')
export class RecommendationController {
  constructor(private recommender: RecommenderService, private prisma: PrismaService, private redis: RedisService) {}

  @Get()
  async get(@CurrentUser() user: any, @Query('limit') limit = '20') {
    const cacheKey = `recommendations:${user.id}`;
    const cached = await this.redis.get(cacheKey);
    const ids = cached ? JSON.parse(cached) : await this.recommender.topNPicksForUser(user.id, parseInt(limit, 10));
    if (!ids.length) return [];
    const courses = await this.prisma.rmCourseCatalog.findMany({ where: { id: { in: ids } } });
    const byId = new Map(courses.map((c) => [c.id, c]));
    return ids.map((id: string) => byId.get(id)).filter(Boolean);
  }
}
