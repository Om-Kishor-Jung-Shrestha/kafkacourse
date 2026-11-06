import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsEnum, Matches, Length } from 'class-validator';
import { Transform } from 'class-transformer';

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
const STRONG_PASSWORD_MSG = 'Must contain at least one uppercase, one lowercase letter, and one digit';

export class RegisterDto {
  @IsEmail() @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString() @MinLength(8) @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MSG })
  password: string;

  @IsString() @MaxLength(60)
  firstName: string;

  @IsOptional() @IsString() @MaxLength(60)
  lastName?: string;
}

export class LoginDto {
  @IsEmail() @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString() @MinLength(8)
  password: string;
}

export class OtpSendDto {
  @IsEmail() @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsEnum(['REGISTRATION', 'LOGIN', 'PASSWORD_RESET', 'EMAIL_CHANGE', 'ADMIN_INVITE'])
  purpose: string;
}

export class OtpVerifyDto extends OtpSendDto {
  @IsString() @Length(6, 6)
  code: string;
}

export class PromoteToCreatorDto {}

export class RefreshDto {
  @IsString() @MinLength(10)
  refreshToken: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(60)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(60)
  lastName?: string;
}
