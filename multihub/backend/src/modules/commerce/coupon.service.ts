import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export type CouponCourse = { id: string; priceCents: number; creatorId: string };

export type CouponEvaluation = {
  code: string;
  percentOff: number;
  /** discount in cents per course id (only courses the coupon applies to) */
  perCourse: Record<string, number>;
  totalDiscountCents: number;
};

@Injectable()
export class CouponService {
  constructor(private prisma: PrismaService) {}

  normalize(code: string): string {
    return (code ?? '').trim().toUpperCase();
  }

  /** Validates a coupon against the given courses and works out the discount per course. Throws a user-readable 400 otherwise. */
  async evaluate(rawCode: string, courses: CouponCourse[]): Promise<CouponEvaluation> {
    const code = this.normalize(rawCode);
    const coupon = code ? await this.prisma.coupon.findUnique({ where: { code } }) : null;
    if (!coupon || !coupon.isActive) throw new BadRequestException('This coupon code is not valid');
    if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) throw new BadRequestException('This coupon has expired');
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) throw new BadRequestException('This coupon has reached its usage limit');

    const applies = (c: CouponCourse) =>
      coupon.courseId ? coupon.courseId === c.id : coupon.creatorId ? coupon.creatorId === c.creatorId : true;

    const perCourse: Record<string, number> = {};
    for (const c of courses) {
      if (applies(c) && c.priceCents > 0) perCourse[c.id] = Math.min(c.priceCents, Math.round((c.priceCents * coupon.percentOff) / 100));
    }
    const totalDiscountCents = Object.values(perCourse).reduce((a, b) => a + b, 0);
    if (Object.keys(perCourse).length === 0) throw new BadRequestException('This coupon does not apply to the selected courses');

    return { code: coupon.code, percentOff: coupon.percentOff, perCourse, totalDiscountCents };
  }
}
