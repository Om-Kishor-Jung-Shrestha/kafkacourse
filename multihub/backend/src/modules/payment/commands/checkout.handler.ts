import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PinoLoggerService } from '../../../common/logger/pino-logger.service';
import { CouponService } from '../../commerce/coupon.service';
import { env } from '../../../config/env';

const REFUND_WINDOW_DAYS = 30;
const REFUND_MAX_PROGRESS = 0.5;

/**
 * Udemy-style checkout: one Order covers one-or-many courses (cart checkout or "Buy now"),
 * with one Payment row per course so refunds and creator revenue stay per-course.
 *
 * Real Stripe Checkout when STRIPE_SECRET_KEY is set (the Order stores the Stripe session id and
 * the signature-verified webhook finalizes it). Without a key a local mock session is used so the
 * whole purchase -> enrollment flow works with zero setup; POST /api/payments/complete/:sessionId
 * (owner only) then stands in for the webhook.
 * Orders whose total is $0 (free courses / 100%-off coupons) are fulfilled immediately in both modes.
 */
@Injectable()
export class CheckoutHandler {
  private readonly stripe: Stripe | null = env.stripeConfigured
    ? new Stripe(env.stripeSecretKey, { apiVersion: '2024-06-20' as Stripe.LatestApiVersion })
    : null;

  constructor(private prisma: PrismaService, private logger: PinoLoggerService, private coupons: CouponService) {}

  /** Price a basket without creating anything (used by the cart/checkout pages). */
  async quote(courseIds: string[], couponCode?: string) {
    const courses = await this.loadCourses(courseIds);
    const evaluation = couponCode?.trim() ? await this.coupons.evaluate(couponCode, courses) : null;
    return this.priceLines(courses, evaluation);
  }

  async createOrder(userId: string, courseIds: string[], couponCode?: string) {
    const ids = [...new Set(courseIds)];
    if (ids.length === 0) throw new BadRequestException('Your cart is empty');
    if (ids.length > 20) throw new BadRequestException('You can check out at most 20 courses at a time');

    const courses = await this.loadCourses(ids);
    if (courses.some((c) => c.creatorId === userId)) throw new BadRequestException('You cannot buy your own course');
    const owned = await this.prisma.enrollment.findMany({ where: { userId, courseId: { in: ids } }, select: { courseId: true } });
    if (owned.length) {
      const titles = courses.filter((c) => owned.some((o) => o.courseId === c.id)).map((c) => c.title);
      throw new ConflictException(`You are already enrolled in: ${titles.join(', ')}`);
    }

    const evaluation = couponCode?.trim() ? await this.coupons.evaluate(couponCode, courses) : null;
    const priced = this.priceLines(courses, evaluation);

    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          userId,
          subtotalCents: priced.subtotalCents,
          discountCents: priced.discountCents,
          totalCents: priced.totalCents,
          couponCode: evaluation?.code ?? null,
        },
      });
      for (const line of priced.lines) {
        await tx.payment.create({
          data: {
            userId,
            courseId: line.courseId,
            orderId: o.id,
            amountCents: line.netCents,
            currency: 'usd',
            couponCode: line.discountCents > 0 ? evaluation?.code : null,
            discountCents: line.discountCents,
            status: 'PENDING',
          },
        });
      }
      return o;
    });

    // Nothing to charge -> fulfil right away (free courses, 100%-off coupons).
    if (priced.totalCents === 0) {
      await this.finalizeOrder(order.id);
      return { orderId: order.id, status: 'COMPLETED', totalCents: 0, sessionId: null, checkoutUrl: null, mode: 'free' as const };
    }

    let sessionId: string;
    let checkoutUrl: string;
    if (this.stripe) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: user.email,
        line_items: priced.lines
          .filter((l) => l.netCents > 0)
          .map((l) => ({ price_data: { currency: 'usd', product_data: { name: l.title }, unit_amount: l.netCents }, quantity: 1 })),
        success_url: `${env.frontendUrl}/checkout/success?order=${order.id}`,
        cancel_url: `${env.frontendUrl}/cart`,
        metadata: { userId, orderId: order.id },
      });
      sessionId = session.id;
      checkoutUrl = session.url!;
    } else {
      sessionId = `mock_sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      checkoutUrl = `${env.frontendUrl}/checkout/success?order=${order.id}`;
    }

    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: sessionId } }),
      this.prisma.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: order.id,
          eventType: 'CheckoutSessionCreatedEvent',
          payload: { userId, orderId: order.id, sessionId, amountCents: priced.totalCents },
          topic: 'payment.checkout.created',
          component: 'durable',
        },
      }),
    ]);

    this.logger.log(`Order ${order.id} (${priced.lines.length} course(s), $${(priced.totalCents / 100).toFixed(2)}) awaiting payment`, 'CheckoutHandler');
    return { orderId: order.id, status: 'PENDING', totalCents: priced.totalCents, sessionId, checkoutUrl, mode: this.stripe ? ('stripe' as const) : ('mock' as const) };
  }

  /** Mock-mode only, and only for the order's owner: stands in for Stripe's webhook. */
  async completeMock(userId: string, sessionId: string) {
    if (this.stripe && !sessionId.startsWith('mock_sess_')) {
      throw new BadRequestException('Real Stripe payments complete automatically via webhook, not this endpoint');
    }
    const order = await this.prisma.order.findUnique({ where: { stripeSessionId: sessionId } });
    if (order) {
      if (order.userId !== userId) throw new ForbiddenException('Not your order');
      return this.finalizeOrder(order.id);
    }
    return this.finalizeLegacyPayment(sessionId, userId);
  }

  /** Called by the real, signature-verified Stripe webhook. */
  async completeFromStripeEvent(stripeSessionId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { stripeSessionId } });
    if (order) await this.finalizeOrder(order.id);
    else await this.finalizeLegacyPayment(stripeSessionId);
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');
    const payments = await this.prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
    const courses = await this.prisma.course.findMany({
      where: { id: { in: payments.map((p) => p.courseId) } },
      select: { id: true, title: true, slug: true, thumbnailUrl: true, category: true, priceCents: true },
    });
    const enrollments = await this.prisma.enrollment.findMany({ where: { userId, courseId: { in: courses.map((c) => c.id) } }, select: { id: true, courseId: true } });
    const items = payments.map((p) => ({
      paymentId: p.id,
      status: p.status,
      amountCents: p.amountCents,
      discountCents: p.discountCents,
      course: courses.find((c) => c.id === p.courseId) ?? null,
      enrollmentId: enrollments.find((e) => e.courseId === p.courseId)?.id ?? null,
    }));
    return { ...order, items };
  }

  /** Learner's purchase history with refund eligibility. */
  async myPayments(userId: string) {
    const payments = await this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    if (!payments.length) return [];
    const courses = await this.prisma.course.findMany({
      where: { id: { in: payments.map((p) => p.courseId) } },
      select: { id: true, title: true, slug: true, thumbnailUrl: true, category: true },
    });
    const enrollments = await this.prisma.enrollment.findMany({ where: { userId, courseId: { in: payments.map((p) => p.courseId) } } });
    return payments.map((p) => {
      const enrollment = enrollments.find((e) => e.courseId === p.courseId);
      return { ...p, course: courses.find((c) => c.id === p.courseId) ?? null, enrollmentId: enrollment?.id ?? null, ...this.refundEligibility(p, enrollment) };
    });
  }

  async refund(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== userId) throw new ForbiddenException('Not your payment');
    const enrollment = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: payment.courseId } } });
    const eligibility = this.refundEligibility(payment, enrollment ?? undefined);
    if (!eligibility.refundable) throw new BadRequestException(eligibility.refundReason ?? 'This purchase cannot be refunded');

    // Real money: refund through Stripe first, so a Stripe failure leaves everything untouched.
    const order = payment.orderId ? await this.prisma.order.findUnique({ where: { id: payment.orderId } }) : null;
    const sessionId = order?.stripeSessionId ?? payment.stripeSessionId;
    if (this.stripe && sessionId && !sessionId.startsWith('mock_sess_')) {
      try {
        const session = await this.stripe.checkout.sessions.retrieve(sessionId);
        const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        if (!intent) throw new Error('No payment intent on session');
        await this.stripe.refunds.create({ payment_intent: intent, amount: payment.amountCents });
      } catch (err) {
        this.logger.warn(`Stripe refund failed for payment ${paymentId}: ${(err as Error).message}`, 'CheckoutHandler');
        throw new BadGatewayException('The payment provider could not process the refund. Please try again later.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', refundedAt: new Date() } });
      if (enrollment) await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: 'REFUNDED' } });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Payment',
          aggregateId: payment.id,
          eventType: 'PaymentRefundedEvent',
          payload: { paymentId: payment.id, userId, courseId: payment.courseId, amountCents: payment.amountCents },
          topic: 'payment.refunded',
          component: 'durable',
        },
      });
    });
    return { refunded: true, amountCents: payment.amountCents };
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.stripe) throw new BadRequestException('Stripe is not configured');
    return this.stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  }

  // ───────── internals ─────────

  private refundEligibility(payment: { status: string; amountCents: number; paidAt: Date | null }, enrollment?: { progress: number }) {
    if (payment.status !== 'COMPLETED') return { refundable: false, refundReason: payment.status === 'REFUNDED' ? 'Already refunded' : null };
    if (payment.amountCents <= 0) return { refundable: false, refundReason: 'Free courses have nothing to refund' };
    const ageDays = (Date.now() - (payment.paidAt?.getTime() ?? 0)) / 86_400_000;
    if (ageDays > REFUND_WINDOW_DAYS) return { refundable: false, refundReason: `Refunds are available within ${REFUND_WINDOW_DAYS} days of purchase` };
    if ((enrollment?.progress ?? 0) > REFUND_MAX_PROGRESS) return { refundable: false, refundReason: `Not refundable once more than ${REFUND_MAX_PROGRESS * 100}% of the course is completed` };
    return { refundable: true, refundReason: null };
  }

  private async loadCourses(ids: string[]) {
    const courses = await this.prisma.course.findMany({ where: { id: { in: ids } } });
    if (courses.length !== new Set(ids).size) throw new NotFoundException('One of the courses no longer exists');
    const unavailable = courses.filter((c) => c.status !== 'PUBLISHED');
    if (unavailable.length) throw new BadRequestException(`Not available for purchase: ${unavailable.map((c) => c.title).join(', ')}`);
    return courses;
  }

  private priceLines(courses: { id: string; title: string; priceCents: number; creatorId: string }[], evaluation: { code: string; percentOff: number; perCourse: Record<string, number> } | null) {
    const lines = courses.map((c) => {
      const discountCents = evaluation?.perCourse[c.id] ?? 0;
      return { courseId: c.id, title: c.title, priceCents: c.priceCents, discountCents, netCents: c.priceCents - discountCents };
    });
    const subtotalCents = lines.reduce((a, l) => a + l.priceCents, 0);
    const discountCents = lines.reduce((a, l) => a + l.discountCents, 0);
    return { lines, subtotalCents, discountCents, totalCents: subtotalCents - discountCents, coupon: evaluation ? { code: evaluation.code, percentOff: evaluation.percentOff } : null };
  }

  /** Idempotent: marks the order + payments paid, enrolls the learner, clears cart/wishlist entries and bumps coupon usage. */
  private async finalizeOrder(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Atomic PENDING -> COMPLETED claim: a duplicate webhook delivery sees count 0 and exits.
      const claimed = await tx.order.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'COMPLETED', paidAt: new Date() } });
      if (claimed.count === 0) return { alreadyProcessed: true };

      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const payments = await tx.payment.findMany({ where: { orderId } });
      await tx.payment.updateMany({ where: { orderId }, data: { status: 'COMPLETED', paidAt: new Date() } });

      for (const p of payments) {
        const existing = await tx.enrollment.findUnique({ where: { userId_courseId: { userId: p.userId, courseId: p.courseId } } });
        if (!existing) await tx.enrollment.create({ data: { userId: p.userId, courseId: p.courseId, status: 'ACTIVE', progress: 0 } });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Payment',
            aggregateId: p.id,
            eventType: 'PaymentCompletedEvent',
            payload: { paymentId: p.id, orderId, userId: p.userId, courseId: p.courseId, amountCents: p.amountCents },
            topic: 'payment.completed',
            component: 'durable',
          },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Enrollment',
            aggregateId: `${p.userId}:${p.courseId}`,
            eventType: 'EnrollmentCreatedEvent',
            payload: { userId: p.userId, courseId: p.courseId },
            topic: 'enrollment.created',
            component: 'durable',
          },
        });
      }

      const courseIds = payments.map((p) => p.courseId);
      await tx.cartItem.deleteMany({ where: { userId: order.userId, courseId: { in: courseIds } } });
      await tx.wishlistItem.deleteMany({ where: { userId: order.userId, courseId: { in: courseIds } } });
      if (order.couponCode) await tx.coupon.updateMany({ where: { code: order.couponCode }, data: { usedCount: { increment: 1 } } });

      return { completed: true, orderId };
    });
  }

  /** Payments created before orders existed (single-course, keyed by their own session id). */
  private async finalizeLegacyPayment(stripeSessionId: string, userId?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { stripeSessionId } });
    if (!payment) throw new NotFoundException('Session not found');
    if (userId && payment.userId !== userId) throw new ForbiddenException('Not your payment');
    if (payment.status === 'COMPLETED') return { alreadyProcessed: true };
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'COMPLETED', paidAt: new Date() } });
      const existing = await tx.enrollment.findUnique({ where: { userId_courseId: { userId: payment.userId, courseId: payment.courseId } } });
      if (!existing) await tx.enrollment.create({ data: { userId: payment.userId, courseId: payment.courseId, status: 'ACTIVE', progress: 0 } });
      await tx.outboxEvent.create({
        data: { aggregateType: 'Payment', aggregateId: payment.id, eventType: 'PaymentCompletedEvent', payload: { paymentId: payment.id, userId: payment.userId, courseId: payment.courseId, amountCents: payment.amountCents }, topic: 'payment.completed', component: 'durable' },
      });
      await tx.outboxEvent.create({
        data: { aggregateType: 'Enrollment', aggregateId: `${payment.userId}:${payment.courseId}`, eventType: 'EnrollmentCreatedEvent', payload: { userId: payment.userId, courseId: payment.courseId }, topic: 'enrollment.created', component: 'durable' },
      });
    });
    return { completed: true };
  }
}
