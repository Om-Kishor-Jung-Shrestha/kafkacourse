import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { getCommissionPercent, creatorShareCents } from '../../../common/commerce/commission';

// §25.7 — pending payout = sum of COMPLETED payments for the creator's
// courses, minus the platform commission. One PENDING payout at a time.
@Injectable()
export class RequestPayoutHandler {
  constructor(private prisma: PrismaService) {}

  async execute(creatorId: string, payoutMethod?: string) {
    const pending = await this.prisma.payout.findFirst({ where: { creatorId, status: 'PENDING' } });
    if (pending) throw new ConflictException('A pending payout already exists');

    const courseIds = (await this.prisma.course.findMany({ where: { creatorId }, select: { id: true } })).map((c) => c.id);
    const completedPayments = courseIds.length
      ? await this.prisma.payment.findMany({ where: { courseId: { in: courseIds }, status: 'COMPLETED' } })
      : [];
    const alreadyPaidOut = await this.prisma.payout.aggregate({
      where: { creatorId, status: { in: ['PROCESSED', 'PENDING'] } },
      _sum: { amountCents: true },
    });

    const grossCents = completedPayments.reduce((s, p) => s + p.amountCents, 0);
    const totalCreatorShare = creatorShareCents(grossCents, await getCommissionPercent(this.prisma));
    const creatorPayCents = totalCreatorShare - (alreadyPaidOut._sum.amountCents ?? 0);

    if (creatorPayCents <= 0) throw new BadRequestException('No payout balance available');

    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.payout.create({
        data: { creatorId, amountCents: creatorPayCents, currency: 'usd', payoutMethod, status: 'PENDING' },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Payout',
          aggregateId: payout.id,
          eventType: 'PayoutRequestedEvent',
          payload: { payoutId: payout.id, creatorId, amountCents: creatorPayCents },
          topic: 'payout.requested',
          component: 'durable',
        },
      });
      return payout;
    });
  }
}
