export interface UploadResult {
  url: string;
  publicId: string;
  storage: 'LOCAL_FILE' | 'CLOUDINARY_FILE' | 'S3_FILE';
}

export interface StorageAdapter {
  uploadFile(buffer: Buffer, originalName: string, folder: string): Promise<UploadResult>;
  deleteFile(publicId: string): Promise<void>;
}
