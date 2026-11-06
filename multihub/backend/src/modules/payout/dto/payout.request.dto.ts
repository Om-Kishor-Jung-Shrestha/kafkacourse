import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestPayoutDto {
  @IsOptional() @IsString() @MaxLength(100)
  payoutMethod?: string;
}

export class ProcessPayoutDto {
  @IsEnum(['PROCESSED', 'FAILED'])
  status: 'PROCESSED' | 'FAILED';

  @IsOptional() @IsString() @MaxLength(500)
  adminNotes?: string;
}
