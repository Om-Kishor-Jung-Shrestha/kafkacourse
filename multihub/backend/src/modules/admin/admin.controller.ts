import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { SuspendUserDto } from './dto/admin.request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserMapper } from '../../common/mappers/user.mapper';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/admin')
export class AdminController {
  constructor(private prisma: PrismaService) {}

  @Get('users')
  async listUsers() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return users.map((u) => UserMapper.toDto(u));
  }

  @Patch('users/:id/suspend')
  async suspend(@Param('id') id: string, @Body() dto: SuspendUserDto) {
    const u = await this.prisma.user.update({ where: { id }, data: { status: 'SUSPENDED', statusReason: dto.reason } });
    return UserMapper.toDto(u);
  }

  @Patch('users/:id/ban')
  async ban(@Param('id') id: string, @Body() dto: SuspendUserDto) {
    const u = await this.prisma.user.update({ where: { id }, data: { status: 'BANNED', statusReason: dto.reason } });
    return UserMapper.toDto(u);
  }

  @Patch('users/:id/reactivate')
  async reactivate(@Param('id') id: string) {
    const u = await this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE', statusReason: null } });
    return UserMapper.toDto(u);
  }
}
