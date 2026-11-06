import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { UserMapper } from '../../../common/mappers/user.mapper';

// RULE-20: promoteToCreator requires isEmailVerified = true.
@Injectable()
export class PromoteToCreatorHandler {
  constructor(private prisma: PrismaService) {}

  async execute(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.isEmailVerified) throw new ForbiddenException('Email must be verified before becoming a creator');

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: userId }, data: { role: 'CREATOR' } });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'User',
          aggregateId: userId,
          eventType: 'UserPromotedEvent',
          payload: { userId },
          topic: 'user.promoted',
          component: 'durable',
        },
      });
      return u;
    });

    return UserMapper.toDto(updated);
  }
}
