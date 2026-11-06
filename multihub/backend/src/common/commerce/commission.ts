import { PrismaService } from '../prisma/prisma.service';
import { env } from '../../config/env';

/**
 * Platform commission %. The SuperAdmin edits it in the DB (StorageConfig),
 * so that is the source of truth; the env var is only the fallback default.
 * (Payouts previously read only the env var, so the SuperAdmin setting had no effect.)
 */
export async function getCommissionPercent(prisma: PrismaService): Promise<number> {
  const cfg = await prisma.storageConfig.findUnique({ where: { id: 'singleton' } });
  return cfg?.commissionPercent ?? env.platformCommissionPercent;
}

export function creatorShareCents(grossCents: number, commissionPercent: number): number {
  return Math.round(grossCents * (1 - commissionPercent / 100));
}
