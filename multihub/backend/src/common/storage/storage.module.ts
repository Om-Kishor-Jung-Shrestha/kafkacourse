import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { LocalStorageService } from './local-storage.service';
import { CloudinaryStorageService } from './cloudinary-storage.service';
import { S3StorageService } from './s3-storage.service';

@Global()
@Module({
  providers: [StorageService, LocalStorageService, CloudinaryStorageService, S3StorageService],
  exports: [StorageService],
})
export class StorageModule {}
