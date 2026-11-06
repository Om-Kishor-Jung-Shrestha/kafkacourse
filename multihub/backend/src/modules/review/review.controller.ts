import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CreateReviewDto } from './dto/review.request.dto';
import { CreateReviewHandler } from './commands/create-review.handler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('api')
export class ReviewController {
  constructor(private createHandler: CreateReviewHandler, private prisma: PrismaService) {}

  @Get('courses/:id/reviews')
  list(@Param('id') courseId: string) {
    return this.prisma.review.findMany({ where: { courseId }, include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' } });
  }

  @UseGuards(JwtAuthGuard)
  @Post('reviews')
  create(@CurrentUser() user: any, @Body() dto: CreateReviewDto) {
    return this.createHandler.execute(user.id, dto.courseId, dto.rating, dto.comment);
  }
}
