import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LocalStorageService } from './local-storage.service';
import { CloudinaryStorageService } from './cloudinary-storage.service';
import { S3StorageService } from './s3-storage.service';
import { StorageAdapter, UploadResult } from './storage-adapter.interface';
import { env } from '../../config/env';

const CACHE_KEY = 'config:storage:strategy';
const CACHE_TTL_SECONDS = 3600;

// RULE-12 — Strategy Pattern. Active strategy comes from the StorageConfig
// DB singleton (superadmin.controller.ts), Redis-cached for 1h; falls back
// to STORAGE_STRATEGY env var / 'local' if the DB row doesn't exist yet.
@Injectable()
export class StorageService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private local: LocalStorageService,
    private cloudinary: CloudinaryStorageService,
    private s3: S3StorageService,
  ) {}

  async getActiveStrategyName(): Promise<string> {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) return cached;

    const config = await this.prisma.storageConfig.findUnique({ where: { id: 'singleton' } });
    const strategy = config?.strategy ?? env.storageStrategy;
    await this.redis.setex(CACHE_KEY, CACHE_TTL_SECONDS, strategy);
    return strategy;
  }

  async getActiveAdapter(): Promise<StorageAdapter> {
    const strategy = await this.getActiveStrategyName();
    switch (strategy) {
      case 'cloudinary':
        return this.cloudinary;
      case 's3':
        return this.s3;
      default:
        return this.local;
    }
  }

  async upload(buffer: Buffer, originalName: string, folder: string): Promise<UploadResult> {
    const adapter = await this.getActiveAdapter();
    return adapter.uploadFile(buffer, originalName, folder);
  }

  async invalidateCache(): Promise<void> {
    await this.redis.del(CACHE_KEY);
  }
}
