import { IsBoolean, IsOptional } from 'class-validator';

export class CompleteLessonDto {
  /** true (default) marks the lesson done, false un-marks it. */
  @IsOptional() @IsBoolean() completed?: boolean;
}
