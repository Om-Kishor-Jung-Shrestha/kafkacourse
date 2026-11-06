import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { EmailService } from '../../../common/email/email.service';

// §16 — OTP system: Redis-backed rate limit + cooldown + attempt counter.
@Injectable()
export class OtpHandler {
  constructor(private prisma: PrismaService, private redis: RedisService, private email: EmailService) {}

  async generateAndSend(email: string, purpose: string) {
    const rateKey = `otp:ratelimit:${email}:${purpose}`;
    const cooldownKey = `otp:cooldown:${email}:${purpose}`;

    const count = await this.redis.incr(rateKey);
    if (count === 1) await this.redis.expire(rateKey, 3600);
    if (count > 5) throw new ForbiddenException('Too many OTP requests, try again later');

    if (await this.redis.exists(cooldownKey)) {
      throw new ForbiddenException('Please wait before requesting another code');
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const hash = await bcrypt.hash(code, 8);

    await this.prisma.otpCode.deleteMany({ where: { email, purpose: purpose as any, used: false } });
    await Promise.all([
      this.prisma.otpCode.create({
        data: { email, codeHash: hash, purpose: purpose as any, expiresAt: new Date(Date.now() + 180_000) },
      }),
      this.redis.setex(`otp:code:${email}:${purpose}`, 180, hash),
      this.redis.setex(cooldownKey, 60, '1'),
    ]);

    await this.email.sendOtp(email, code, purpose);
    return { expiresInSeconds: 180, cooldownSeconds: 60, remainingResends: 5 - count };
  }

  async verify(email: string, purpose: string, providedCode: string) {
    const storedHash = await this.redis.get(`otp:code:${email}:${purpose}`);
    if (!storedHash) throw new UnauthorizedException('Code expired, please request a new one');

    const attemptsKey = `otp:attempts:${email}:${purpose}`;
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) await this.redis.expire(attemptsKey, 3600);
    if (attempts > 5) throw new ForbiddenException('Too many failed attempts');

    const valid = await bcrypt.compare(providedCode, storedHash);
    if (!valid) throw new UnauthorizedException(`Invalid code, ${5 - attempts} attempts remaining`);

    await this.redis.del(`otp:code:${email}:${purpose}`, attemptsKey, `otp:ratelimit:${email}:${purpose}`);
    await this.prisma.otpCode.updateMany({ where: { email, purpose: purpose as any, used: false }, data: { used: true } });

    if (purpose === 'REGISTRATION') {
      await this.prisma.user.updateMany({ where: { email }, data: { isEmailVerified: true } });
    }
    return { verified: true };
  }
}
