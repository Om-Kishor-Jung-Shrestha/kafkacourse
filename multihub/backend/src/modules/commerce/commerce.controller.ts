import { BadRequestException, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Shared: turn a list of course ids into catalog cards, preserving the saved order (newest first). */
async function catalogCards(prisma: PrismaService, rows: { courseId: string; createdAt: Date }[]) {
  if (!rows.length) return [];
  const catalog = await prisma.rmCourseCatalog.findMany({ where: { id: { in: rows.map((r) => r.courseId) } } });
  const byId = new Map(catalog.map((c) => [c.id, c]));
  return rows.map((r) => (byId.has(r.courseId) ? { ...byId.get(r.courseId)!, addedAt: r.createdAt } : null)).filter(Boolean);
}

async function assertPurchasable(prisma: PrismaService, userId: string, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.status !== 'PUBLISHED') throw new NotFoundException('Course not available');
  if (course.creatorId === userId) throw new BadRequestException('You cannot buy your own course');
  return course;
}

@UseGuards(JwtAuthGuard)
@Controller('api/cart')
export class CartController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: any) {
    const rows = await this.prisma.cartItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    // Courses the learner has since enrolled in (or that are no longer published) silently drop out of the cart.
    const enrolled = new Set((await this.prisma.enrollment.findMany({ where: { userId: user.id }, select: { courseId: true } })).map((e) => e.courseId));
    const live = rows.filter((r) => !enrolled.has(r.courseId));
    const cards: any[] = (await catalogCards(this.prisma, live)).filter((c: any) => c.status === 'PUBLISHED');
    const stale = rows.filter((r) => !cards.some((c) => c.id === r.courseId)).map((r) => r.id);
    if (stale.length) await this.prisma.cartItem.deleteMany({ where: { id: { in: stale } } });
    return cards;
  }

  @Post(':courseId')
  async add(@Param('courseId') courseId: string, @CurrentUser() user: any) {
    await assertPurchasable(this.prisma, user.id, courseId);
    const enrolled = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
    if (enrolled) throw new ConflictException('You are already enrolled in this course');
    await this.prisma.cartItem.upsert({
      where: { userId_courseId: { userId: user.id, courseId } },
      update: {},
      create: { userId: user.id, courseId },
    });
    return { success: true };
  }

  @Delete(':courseId')
  async remove(@Param('courseId') courseId: string, @CurrentUser() user: any) {
    await this.prisma.cartItem.deleteMany({ where: { userId: user.id, courseId } });
    return { success: true };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('api/wishlist')
export class WishlistController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: any) {
    const rows = await this.prisma.wishlistItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    return (await catalogCards(this.prisma, rows)).filter((c: any) => c.status === 'PUBLISHED');
  }

  @Post(':courseId')
  async add(@Param('courseId') courseId: string, @CurrentUser() user: any) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course || course.status !== 'PUBLISHED') throw new NotFoundException('Course not available');
    await this.prisma.wishlistItem.upsert({
      where: { userId_courseId: { userId: user.id, courseId } },
      update: {},
      create: { userId: user.id, courseId },
    });
    return { success: true };
  }

  @Delete(':courseId')
  async remove(@Param('courseId') courseId: string, @CurrentUser() user: any) {
    await this.prisma.wishlistItem.deleteMany({ where: { userId: user.id, courseId } });
    return { success: true };
  }
}
