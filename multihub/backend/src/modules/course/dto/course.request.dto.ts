import { IsString, IsInt, IsOptional, IsEnum, IsArray, Min, MaxLength, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCourseDto {
  @IsString() @MaxLength(200) title: string;
  @IsString() @MaxLength(5000) description: string;
  @IsInt() @Min(0) @Type(() => Number) priceCents: number;
  @IsEnum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']) level: string;
  @IsString() @MaxLength(80) category: string;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(10) tags: string[];
  @IsOptional() @IsString() @MaxLength(10) language?: string;
  @IsOptional() @IsString() @MaxLength(200) subtitle?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(12) learningOutcomes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(12) requirements?: string[];
}

export class UpdateCourseDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) priceCents?: number;
  @IsOptional() @IsEnum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']) level?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(10) tags?: string[];
}

export class RejectCourseDto {
  @IsString() @MaxLength(500) reason: string;
}

export class ListCoursesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() q?: string;
}
