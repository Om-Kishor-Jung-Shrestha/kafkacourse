import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class ProcessPayoutHandler {
  constructor(private prisma: PrismaService) {}

  async execute(payoutId: string, status: 'PROCESSED' | 'FAILED', adminNotes?: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'PENDING') throw new ConflictException('Payout already processed');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payout.update({
        where: { id: payoutId },
        data: { status, adminNotes, processedAt: new Date() },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Payout',
          aggregateId: payoutId,
          eventType: 'PayoutProcessedEvent',
          payload: { payoutId, creatorId: payout.creatorId, status, amountCents: payout.amountCents },
          topic: 'payout.processed',
          component: 'durable',
        },
      });
      return updated;
    });
  }
}
