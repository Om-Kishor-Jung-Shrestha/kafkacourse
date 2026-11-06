import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { UserMapper } from '../../../common/mappers/user.mapper';
import { env } from '../../../config/env';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Refresh-token rotation. The refresh token handed to the client has the
 * shape `<rowId>.<secret>`: the row id lets us find the DB row directly
 * (the secret itself is only stored bcrypt-hashed, so it can't be looked
 * up). Every refresh revokes the presented token and issues a new one in
 * the same "family"; presenting an already-revoked token means it was
 * stolen/replayed, so the whole family is revoked.
 */
@Injectable()
export class RefreshTokenHandler {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async refresh(refreshToken: string) {
    const [id, secret] = (refreshToken ?? '').split('.');
    if (!id || !secret) throw new UnauthorizedException('Invalid refresh token');

    const row = await this.prisma.refreshToken.findUnique({ where: { id }, include: { user: true } });
    if (!row || !(await bcrypt.compare(secret, row.tokenHash))) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (row.revoked) {
      await this.prisma.refreshToken.updateMany({ where: { family: row.family }, data: { revoked: true } });
      throw new UnauthorizedException('Refresh token was already used — please log in again');
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException('Session expired — please log in again');
    if (row.user.status === 'SUSPENDED') throw new ForbiddenException('Account suspended');
    if (row.user.status === 'BANNED') throw new ForbiddenException('Account banned');

    const newId = crypto.randomUUID();
    const newSecret = crypto.randomUUID();
    const newHash = await bcrypt.hash(newSecret, 10);

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({ where: { id }, data: { revoked: true } }),
      this.prisma.refreshToken.create({
        data: { id: newId, userId: row.userId, tokenHash: newHash, family: row.family, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
      }),
    ]);

    const accessToken = await this.jwtService.signAsync(
      { sub: row.user.id, email: row.user.email, role: row.user.role },
      { secret: env.jwtAccessSecret, expiresIn: env.jwtAccessExpiresIn as any },
    );
    return { accessToken, refreshToken: `${newId}.${newSecret}`, user: UserMapper.toDto(row.user) };
  }

  /** Logout: revoke the whole token family. Never throws (logout must always "succeed"). */
  async revoke(refreshToken: string) {
    const [id] = (refreshToken ?? '').split('.');
    if (!id) return { success: true };
    const row = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (row) await this.prisma.refreshToken.updateMany({ where: { family: row.family }, data: { revoked: true } });
    return { success: true };
  }
}
