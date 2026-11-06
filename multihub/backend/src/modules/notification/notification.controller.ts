import { Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('api/notifications')
export class NotificationController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: any) {
    return this.prisma.rmNotificationInbox.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: any) {
    const count = await this.prisma.rmNotificationInbox.count({ where: { userId: user.id, isRead: false } });
    return { count };
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: any) {
    const res = await this.prisma.rmNotificationInbox.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
    return { updated: res.count };
  }

  // Scoped to the caller — previously any user could mark any notification read.
  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: any) {
    const res = await this.prisma.rmNotificationInbox.updateMany({ where: { id, userId: user.id }, data: { isRead: true } });
    if (res.count === 0) throw new NotFoundException('Notification not found');
    return { success: true };
  }
}
