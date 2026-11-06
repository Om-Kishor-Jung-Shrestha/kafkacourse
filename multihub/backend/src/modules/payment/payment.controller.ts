import { BadRequestException, Body, Controller, Get, Headers, Param, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { CreateCheckoutDto, QuoteDto } from './dto/payment.request.dto';
import { CheckoutHandler } from './commands/checkout.handler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PinoLoggerService } from '../../common/logger/pino-logger.service';
import { env } from '../../config/env';

@Controller('api/payments')
export class PaymentController {
  constructor(
    private checkoutHandler: CheckoutHandler,
    private prisma: PrismaService,
    private logger: PinoLoggerService,
  ) {}

  // Price a basket (+ optional coupon) without creating an order. Public so a logged-out visitor
  // landing on /courses/x?couponCode=ABC can see the discounted price.
  @Post('quote')
  quote(@Body() dto: QuoteDto) {
    return this.checkoutHandler.quote(dto.courseIds, dto.couponCode);
  }

  // Create an order for the given courses, or for the saved cart when none are given.
  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  async checkout(@CurrentUser() user: any, @Body() dto: CreateCheckoutDto) {
    let ids = dto.courseIds ?? (dto.courseId ? [dto.courseId] : null);
    if (!ids) ids = (await this.prisma.cartItem.findMany({ where: { userId: user.id } })).map((c) => c.courseId);
    return this.checkoutHandler.createOrder(user.id, ids, dto.couponCode);
  }

  // Mock mode only (no STRIPE_SECRET_KEY): simulates Stripe's webhook for the caller's own order.
  @UseGuards(JwtAuthGuard)
  @Post('complete/:sessionId')
  complete(@CurrentUser() user: any, @Param('sessionId') sessionId: string) {
    return this.checkoutHandler.completeMock(user.id, sessionId);
  }

  // Real Stripe webhook — signature-verified via the raw request body
  // (see main.ts's `rawBody: true` and env.stripeWebhookSecret).
  @Post('webhook')
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    if (!req.rawBody) throw new BadRequestException('Missing raw request body');
    if (!signature) throw new BadRequestException('Missing Stripe-Signature header');

    let event: Stripe.Event;
    try {
      event = this.checkoutHandler.verifyWebhookSignature(req.rawBody, signature);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature verification failed: ${(err as Error).message}`, 'PaymentController');
      throw new BadRequestException('Invalid Stripe signature');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      await this.checkoutHandler.completeFromStripeEvent(session.id);
    } else if (event.type === 'payment_intent.payment_failed') {
      this.logger.warn(`Stripe payment failed: ${event.id}`, 'PaymentController');
    }

    return { received: true };
  }

  @Get('config')
  config() {
    // Lets the frontend know whether real Stripe is configured (vs. local mock checkout).
    return { stripeConfigured: env.stripeConfigured };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  myPayments(@CurrentUser() user: any) {
    return this.checkoutHandler.myPayments(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/:id')
  order(@CurrentUser() user: any, @Param('id') id: string) {
    return this.checkoutHandler.getOrder(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/refund')
  refund(@CurrentUser() user: any, @Param('id') id: string) {
    return this.checkoutHandler.refund(user.id, id);
  }
}
