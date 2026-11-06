import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env';
import { StorageAdapter, UploadResult } from './storage-adapter.interface';

// §14.3 — used when STORAGE_STRATEGY=cloudinary and CLOUDINARY_* env vars
// are set. Good fit for images (avatars, thumbnails) with on-the-fly
// transformations.
@Injectable()
export class CloudinaryStorageService implements StorageAdapter {
  constructor() {
    cloudinary.config({
      cloud_name: env.cloudinaryCloudName,
      api_key: env.cloudinaryApiKey,
      api_secret: env.cloudinaryApiSecret,
    });
  }

  uploadFile(buffer: Buffer, _originalName: string, folder: string): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'auto', folder: `multihub/${folder}` },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
          resolve({ url: result.secure_url, publicId: result.public_id, storage: 'CLOUDINARY_FILE' });
        },
      );
      stream.end(buffer);
    });
  }

  async deleteFile(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}
