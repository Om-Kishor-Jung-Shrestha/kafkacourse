import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RequestPayoutDto, ProcessPayoutDto } from './dto/payout.request.dto';
import { RequestPayoutHandler } from './commands/request-payout.handler';
import { ProcessPayoutHandler } from './commands/process-payout.handler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/payouts')
export class PayoutController {
  constructor(
    private requestHandler: RequestPayoutHandler,
    private processHandler: ProcessPayoutHandler,
    private prisma: PrismaService,
  ) {}

  @Roles('CREATOR')
  @Post('request')
  request(@CurrentUser() user: any, @Body() dto: RequestPayoutDto) {
    return this.requestHandler.execute(user.id, dto.payoutMethod);
  }

  @Roles('CREATOR')
  @Get('me')
  mine(@CurrentUser() user: any) {
    return this.prisma.payout.findMany({ where: { creatorId: user.id }, orderBy: { requestedAt: 'desc' } });
  }

  @Roles('ADMIN')
  @Get()
  all() {
    return this.prisma.payout.findMany({
      include: { creator: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { requestedAt: 'desc' },
    });
  }

  @Roles('ADMIN')
  @Patch(':id/process')
  process(@Param('id') id: string, @Body() dto: ProcessPayoutDto) {
    return this.processHandler.execute(id, dto.status, dto.adminNotes);
  }
}
