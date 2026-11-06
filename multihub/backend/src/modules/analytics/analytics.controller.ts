import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { getCommissionPercent, creatorShareCents } from '../../common/commerce/commission';
import { PrismaService } from '../../common/prisma/prisma.service';

// §33.8 — Analytics module is queries-only. For this build these are computed
// on demand from write + read models rather than materialized into
// RmAdminAnalytics/RmCreatorAnalytics projector tables, to keep the scope
// tractable; the query shape matches what those projectors would serve.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/analytics')
export class AnalyticsController {
  constructor(private prisma: PrismaService) {}

  @Roles('CREATOR', 'ADMIN')
  // Recent sales of the creator's courses (what Udemy shows under Revenue Report).
  @Get('creator/sales')
  async creatorSales(@CurrentUser() user: any) {
    const courses = await this.prisma.course.findMany({ where: { creatorId: user.id }, select: { id: true, title: true } });
    const commissionPercent = await getCommissionPercent(this.prisma);
    const payments = await this.prisma.payment.findMany({
      where: { courseId: { in: courses.map((c) => c.id) }, status: { in: ['COMPLETED', 'REFUNDED'] }, amountCents: { gt: 0 } },
      orderBy: { paidAt: 'desc' },
      take: 50,
    });
    const buyers = await this.prisma.user.findMany({ where: { id: { in: payments.map((p) => p.userId) } }, select: { id: true, firstName: true, lastName: true } });
    return {
      commissionPercent,
      sales: payments.map((p) => {
        const b = buyers.find((u) => u.id === p.userId);
        return {
          id: p.id,
          paidAt: p.paidAt,
          status: p.status,
          courseTitle: courses.find((c) => c.id === p.courseId)?.title ?? 'Course',
          buyer: [b?.firstName, b?.lastName?.[0] ? `${b.lastName[0]}.` : ''].filter(Boolean).join(' ') || 'Learner',
          amountCents: p.amountCents,
          couponCode: p.couponCode,
          creatorShareCents: creatorShareCents(p.amountCents, commissionPercent),
        };
      }),
    };
  }

  @Roles('CREATOR', 'ADMIN')
  @Get('creator')
  async creatorAnalytics(@CurrentUser() user: any) {
    const courses = await this.prisma.course.findMany({ where: { creatorId: user.id } });
    const courseIds = courses.map((c) => c.id);

    const [enrollmentCount, payments, reviews, pendingPayout] = await Promise.all([
      this.prisma.enrollment.count({ where: { courseId: { in: courseIds } } }),
      this.prisma.payment.findMany({ where: { courseId: { in: courseIds }, status: 'COMPLETED' } }),
      this.prisma.review.findMany({ where: { courseId: { in: courseIds } } }),
      this.prisma.payout.findFirst({ where: { creatorId: user.id, status: 'PENDING' } }),
    ]);

    const totalRevenueCents = payments.reduce((s, p) => s + p.amountCents, 0);
    const commissionPercent = await getCommissionPercent(this.prisma);
    const averageRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

    // Last 6 calendar months of creator-share-agnostic gross revenue + enrollments
    const months = lastMonths(6);
    const revenueByMonth = months.map((m) => ({
      month: m.label,
      revenueCents: payments.filter((p) => p.paidAt && monthKey(p.paidAt) === m.key).reduce((sum, p) => sum + p.amountCents, 0),
    }));
    const topCourses = await Promise.all(
      courses.map(async (c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        status: c.status,
        enrollments: await this.prisma.enrollment.count({ where: { courseId: c.id } }),
        revenueCents: payments.filter((p) => p.courseId === c.id).reduce((sum, p) => sum + p.amountCents, 0),
      })),
    );
    topCourses.sort((a, b) => b.revenueCents - a.revenueCents || b.enrollments - a.enrollments);

    return {
      revenueByMonth,
      topCourses: topCourses.slice(0, 5),
      totalCourses: courses.length,
      publishedCourses: courses.filter((c) => c.status === 'PUBLISHED').length,
      totalEnrollments: enrollmentCount,
      totalRevenueCents,
      pendingPayoutCents: pendingPayout?.amountCents ?? 0,
      commissionPercent,
      earningsCents: creatorShareCents(totalRevenueCents, commissionPercent),
      averageRating: Math.round(averageRating * 10) / 10,
      reviewCount: reviews.length,
    };
  }

  @Roles('ADMIN')
  @Get('admin')
  async adminAnalytics() {
    const [totalUsers, totalCreators, totalEnrollments, payments, pendingCourseApprovals] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'CREATOR' } }),
      this.prisma.enrollment.count(),
      this.prisma.payment.findMany({ where: { status: 'COMPLETED' } }),
      this.prisma.course.count({ where: { status: 'PENDING_REVIEW' } }),
    ]);

    const totalRevenueCents = payments.reduce((s, p) => s + p.amountCents, 0);

    const months = lastMonths(6);
    const revenueByMonth = months.map((m) => ({
      month: m.label,
      revenueCents: payments.filter((p) => p.paidAt && monthKey(p.paidAt) === m.key).reduce((sum, p) => sum + p.amountCents, 0),
    }));

    return {
      revenueByMonth,
      totalUsers,
      totalCreators,
      totalEnrollments,
      totalRevenueCents,
      pendingCourseApprovals,
    };
  }
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function lastMonths(n: number) {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: monthKey(d), label: d.toLocaleString('en-US', { month: 'short' }) });
  }
  return out;
}
