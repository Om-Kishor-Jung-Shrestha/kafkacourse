import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { UserMapper } from '../../../common/mappers/user.mapper';
import { env } from '../../../config/env';

@Injectable()
export class LoginUserHandler {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async execute(email: string, password: string, ip: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === 'SUSPENDED') throw new ForbiddenException('Account suspended');
    if (user.status === 'BANNED') throw new ForbiddenException('Account banned');
    if (!user.password) {
      throw new UnauthorizedException('This account uses Google sign-in — use "Continue with Google" instead');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret: env.jwtAccessSecret, expiresIn: env.jwtAccessExpiresIn as any },
    );
    // Refresh token format: <rowId>.<secret> (see RefreshTokenHandler)
    const refreshId = crypto.randomUUID();
    const refreshSecret = crypto.randomUUID();
    const refreshToken = `${refreshId}.${refreshSecret}`;
    const family = crypto.randomUUID();
    const tokenHash = await bcrypt.hash(refreshSecret, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: ip } });
      await tx.refreshToken.create({
        data: { id: refreshId, userId: user.id, tokenHash, family, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'User',
          aggregateId: user.id,
          eventType: 'UserLoggedInEvent',
          payload: { userId: user.id, ip },
          topic: 'user.login',
          component: 'immediate',
        },
      });
    });

    return { accessToken, refreshToken, user: UserMapper.toDto(user) };
  }
}
