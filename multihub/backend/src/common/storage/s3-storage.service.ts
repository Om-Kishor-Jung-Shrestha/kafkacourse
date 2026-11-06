import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import * as path from 'path';
import { env } from '../../config/env';
import { StorageAdapter, UploadResult } from './storage-adapter.interface';

// §14.4 — used when STORAGE_STRATEGY=s3 and AWS_* env vars are set. Best
// fit for large files (course videos, downloadable resources). Assumes the
// bucket is configured for public read on the `folder` prefixes used here
// (course thumbnails, avatars); for private buckets, generate a presigned
// GET URL per-request instead of storing a permanent public URL.
@Injectable()
export class S3StorageService implements StorageAdapter {
  private readonly client = new S3Client({
    region: env.awsS3Region,
    credentials: { accessKeyId: env.awsAccessKeyId, secretAccessKey: env.awsSecretAccessKey },
  });

  async uploadFile(buffer: Buffer, originalName: string, folder: string): Promise<UploadResult> {
    const now = new Date();
    const ext = path.extname(originalName) || '';
    const key = `${folder}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${ext}`;

    await this.client.send(new PutObjectCommand({ Bucket: env.awsS3Bucket, Key: key, Body: buffer }));

    const url = `https://${env.awsS3Bucket}.s3.${env.awsS3Region}.amazonaws.com/${key}`;
    return { url, publicId: key, storage: 'S3_FILE' };
  }

  async deleteFile(publicId: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.awsS3Bucket, Key: publicId }));
  }
}
