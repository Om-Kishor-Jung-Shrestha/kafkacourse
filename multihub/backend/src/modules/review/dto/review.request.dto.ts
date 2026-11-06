import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReviewDto {
  @IsString() courseId: string;
  @IsInt() @Min(1) @Max(5) @Type(() => Number) rating: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
