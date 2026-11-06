import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { UserMapper } from '../../../common/mappers/user.mapper';

// RULE-02: write model + outbox in ONE transaction, always.
@Injectable()
export class RegisterUserHandler {
  constructor(private prisma: PrismaService) {}

  async execute(email: string, password: string, firstName: string, lastName?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email, password: hashed, firstName, lastName, role: 'USER' },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'User',
          aggregateId: newUser.id,
          eventType: 'UserRegisteredEvent',
          payload: { userId: newUser.id, email, firstName },
          topic: 'user.registered',
          component: 'durable',
        },
      });
      return newUser;
    });

    return UserMapper.toDto(user);
  }
}
