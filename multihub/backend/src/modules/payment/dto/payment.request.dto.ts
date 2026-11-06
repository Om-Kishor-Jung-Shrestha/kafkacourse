import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCheckoutDto {
  /** Courses to buy; omit to check out the saved cart. */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) courseIds?: string[];
  /** Legacy single-course form. */
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() @MaxLength(50) couponCode?: string;
}

export class QuoteDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) courseIds: string[];
  @IsOptional() @IsString() @MaxLength(50) couponCode?: string;
}
