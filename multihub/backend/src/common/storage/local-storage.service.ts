import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { env } from '../../config/env';
import { StorageAdapter, UploadResult } from './storage-adapter.interface';

// RULE-12 default strategy. Files land at LOCAL_UPLOAD_PATH/{folder}/{YYYY}/{MM}/{uuid}.{ext},
// served back out via Kong's embedded static Nginx server / a static route
// in a real deployment (see infra/kong/nginx/custom.conf for the pattern).
@Injectable()
export class LocalStorageService implements StorageAdapter {
  async uploadFile(buffer: Buffer, originalName: string, folder: string): Promise<UploadResult> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const ext = path.extname(originalName) || '';
    const filename = `${crypto.randomUUID()}${ext}`;
    const relativeDir = path.join(folder, String(yyyy), mm);
    const absoluteDir = path.join(env.localUploadPath, relativeDir);

    await fs.mkdir(absoluteDir, { recursive: true });
    await fs.writeFile(path.join(absoluteDir, filename), buffer);

    const publicId = path.join(relativeDir, filename).replace(/\\/g, '/');
    return { url: `/uploads/${publicId}`, publicId, storage: 'LOCAL_FILE' };
  }

  async deleteFile(publicId: string): Promise<void> {
    try {
      await fs.unlink(path.join(env.localUploadPath, publicId));
    } catch {
      // already gone — fine, deletes are best-effort
    }
  }
}
