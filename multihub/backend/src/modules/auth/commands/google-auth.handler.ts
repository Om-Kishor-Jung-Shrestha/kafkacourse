import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailService } from '../../../common/email/email.service';
import { UserMapper } from '../../../common/mappers/user.mapper';
import { env } from '../../../config/env';
import { GoogleProfile } from '../strategies/google.strategy';

// §17 — Google OAuth flow, step "GoogleStrategy.validate()":
//   - Find user by googleId -> log in
//   - Else find user by email -> link Google to the existing (email/password) account
//   - Else create a new user (authProvider = GOOGLE, no password)
@Injectable()
export class GoogleAuthHandler {
  constructor(private prisma: PrismaService, private jwtService: JwtService, private email: EmailService) {}

  async execute(profile: GoogleProfile, ip: string) {
    let user = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });

      if (existingByEmail) {
        if (existingByEmail.status === 'SUSPENDED') throw new ForbiddenException('Account suspended');
        if (existingByEmail.status === 'BANNED') throw new ForbiddenException('Account banned');

        user = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.user.update({
            where: { id: existingByEmail.id },
            data: {
              googleId: profile.googleId,
              authProvider: existingByEmail.authProvider === 'EMAIL' ? 'BOTH' : 'GOOGLE',
              avatarUrl: existingByEmail.avatarUrl ?? profile.avatarUrl,
              isEmailVerified: true,
            },
          });
          await tx.outboxEvent.create({
            data: {
              aggregateType: 'User',
              aggregateId: updated.id,
              eventType: 'UserLinkedGoogleEvent',
              payload: { userId: updated.id, email: updated.email },
              topic: 'user.google.linked',
              component: 'durable',
            },
          });
          return updated;
        });
      } else {
        user = await this.prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              email: profile.email,
              googleId: profile.googleId,
              firstName: profile.firstName ?? 'Learner',
              lastName: profile.lastName,
              avatarUrl: profile.avatarUrl,
              authProvider: 'GOOGLE',
              isEmailVerified: true, // Google already verified this email
              role: 'USER',
              status: 'ACTIVE',
              password: null,
            },
          });
          await tx.outboxEvent.create({
            data: {
              aggregateType: 'User',
              aggregateId: created.id,
              eventType: 'UserRegisteredEvent',
              payload: { userId: created.id, email: created.email, via: 'google' },
              topic: 'user.registered',
              component: 'durable',
            },
          });
          return created;
        });
        await this.email.sendWelcome(user.email, user.firstName ?? 'there');
      }
    } else {
      if (user.status === 'SUSPENDED') throw new ForbiddenException('Account suspended');
      if (user.status === 'BANNED') throw new ForbiddenException('Account banned');
    }

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret: env.jwtAccessSecret, expiresIn: env.jwtAccessExpiresIn as any },
    );
    const refreshId = crypto.randomUUID();
    const refreshSecret = crypto.randomUUID();
    const refreshToken = `${refreshId}.${refreshSecret}`;
    const tokenHash = await bcrypt.hash(refreshSecret, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date(), lastLoginIp: ip } });
      await tx.refreshToken.create({
        data: {
          id: refreshId,
          userId: user!.id,
          tokenHash,
          family: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });

    return { accessToken, refreshToken, user: UserMapper.toDto(user) };
  }
}
