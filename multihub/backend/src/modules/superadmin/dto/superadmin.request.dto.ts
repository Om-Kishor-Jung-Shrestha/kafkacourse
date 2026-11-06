import { IsEnum, IsNumber, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStorageConfigDto {
  @IsEnum(['local', 'cloudinary', 's3'])
  strategy: 'local' | 'cloudinary' | 's3';
}

export class UpdateCommissionDto {
  @IsNumber() @Min(0) @Max(100) @Type(() => Number)
  commissionPercent: number;
}
