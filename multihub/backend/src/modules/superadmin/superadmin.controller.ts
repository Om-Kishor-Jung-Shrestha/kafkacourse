import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UpdateStorageConfigDto, UpdateCommissionDto } from './dto/superadmin.request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

// RULE-12: storage strategy is a Redis-cached DB singleton, default = local.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPERADMIN')
@Controller('api/superadmin')
export class SuperAdminController {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  @Get('storage')
  async getStorage() {
    return this.prisma.storageConfig.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton', strategy: 'local', commissionPercent: 30 },
    });
  }

  @Patch('storage')
  async updateStorage(@Body() dto: UpdateStorageConfigDto) {
    const updated = await this.prisma.storageConfig.update({
      where: { id: 'singleton' },
      data: { strategy: dto.strategy },
    });
    await this.redis.del('config:storage:strategy');
    return updated;
  }

  @Patch('commission')
  async updateCommission(@Body() dto: UpdateCommissionDto) {
    return this.prisma.storageConfig.update({
      where: { id: 'singleton' },
      data: { commissionPercent: dto.commissionPercent },
    });
  }
}
