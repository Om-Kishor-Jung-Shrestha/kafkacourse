import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

export class CreateCouponDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{4,40}$/, { message: 'Code must be 4-40 characters: letters, numbers, - or _' }) code: string;
  @IsInt() @Min(1) @Max(100) @Type(() => Number) percentOff: number;
  @IsOptional() @IsString() @MaxLength(40) courseId?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) maxUses?: number;
  @IsOptional() @IsString() expiresAt?: string;
}

export class UpdateCouponDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// Creators manage coupons for their own courses; admins manage platform-wide ones.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CREATOR', 'ADMIN')
@Controller('api/coupons')
export class CouponController {
  constructor(private prisma: PrismaService) {}

  private isStaff(user: any) {
    return user.role === 'ADMIN' || user.role === 'SUPERADMIN';
  }

  @Get('mine')
  async mine(@CurrentUser() user: any) {
    const where = this.isStaff(user) ? { OR: [{ creatorId: user.id }, { creatorId: null }] } : { creatorId: user.id };
    const coupons = await this.prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' } });
    const courseIds = [...new Set(coupons.map((c) => c.courseId).filter(Boolean))] as string[];
    const courses = courseIds.length ? await this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }) : [];
    const titles = new Map(courses.map((c) => [c.id, c.title]));
    return coupons.map((c) => ({ ...c, courseTitle: c.courseId ? titles.get(c.courseId) ?? null : null, scope: c.courseId ? 'COURSE' : c.creatorId ? 'ALL_MY_COURSES' : 'PLATFORM' }));
  }

  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreateCouponDto) {
    const code = dto.code.trim().toUpperCase();
    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) throw new BadRequestException('Invalid expiry date');
      if (expiresAt.getTime() < Date.now()) throw new BadRequestException('Expiry must be in the future');
    }
    if (dto.courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: dto.courseId } });
      if (!course) throw new NotFoundException('Course not found');
      if (course.creatorId !== user.id && !this.isStaff(user)) throw new ForbiddenException('Not your course');
    }
    if (await this.prisma.coupon.findUnique({ where: { code } })) throw new ConflictException('That coupon code already exists');

    return this.prisma.coupon.create({
      data: {
        code,
        percentOff: dto.percentOff,
        courseId: dto.courseId ?? null,
        // creators: scoped to themselves. admins: platform-wide unless they pick a course.
        creatorId: this.isStaff(user) ? null : user.id,
        maxUses: dto.maxUses ?? null,
        expiresAt,
      },
    });
  }

  private async owned(id: string, user: any) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    const mine = coupon.creatorId === user.id || (this.isStaff(user) && coupon.creatorId === null);
    if (!mine && user.role !== 'SUPERADMIN') throw new ForbiddenException('Not your coupon');
    return coupon;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateCouponDto) {
    await this.owned(id, user);
    return this.prisma.coupon.update({ where: { id }, data: { isActive: dto.isActive } });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.owned(id, user);
    await this.prisma.coupon.delete({ where: { id } });
    return { success: true };
  }
}
