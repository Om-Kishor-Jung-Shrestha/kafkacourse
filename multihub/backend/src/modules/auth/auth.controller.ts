import { BadRequestException, Body, Controller, Get, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { RegisterDto, LoginDto, OtpSendDto, OtpVerifyDto, RefreshDto, UpdateProfileDto } from './dto/auth.request.dto';
import { RegisterUserHandler } from './commands/register-user.handler';
import { LoginUserHandler } from './commands/login-user.handler';
import { OtpHandler } from './commands/otp.handler';
import { PromoteToCreatorHandler } from './commands/promote-to-creator.handler';
import { RefreshTokenHandler } from './commands/refresh-token.handler';
import { GoogleAuthHandler } from './commands/google-auth.handler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GoogleConfiguredGuard } from '../../common/guards/google-configured.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserMapper } from '../../common/mappers/user.mapper';
import { StorageService } from '../../common/storage/storage.service';
import { env } from '../../config/env';

@Controller('api/auth')
export class AuthController {
  constructor(
    private registerHandler: RegisterUserHandler,
    private loginHandler: LoginUserHandler,
    private otpHandler: OtpHandler,
    private promoteHandler: PromoteToCreatorHandler,
    private googleAuthHandler: GoogleAuthHandler,
    private refreshHandler: RefreshTokenHandler,
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.registerHandler.execute(dto.email, dto.password, dto.firstName, dto.lastName);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.loginHandler.execute(dto.email, dto.password, req.ip ?? '0.0.0.0');
  }

  // Rotating refresh: exchange a refresh token for a new access + refresh pair.
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.refreshHandler.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.refreshHandler.revoke(dto.refreshToken);
  }

  @Post('otp/send')
  sendOtp(@Body() dto: OtpSendDto) {
    return this.otpHandler.generateAndSend(dto.email, dto.purpose);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.otpHandler.verify(dto.email, dto.purpose, dto.code);
  }

  // §17 — lets the frontend show/hide the "Continue with Google" button
  // without ever hitting a dead route (GoogleConfiguredGuard would 503 the
  // actual /google route if this isn't set up).
  @Get('google/status')
  googleStatus() {
    return { enabled: env.googleOAuthConfigured };
  }

  // Step 1 of §17: frontend navigates the browser here directly (not fetch),
  // which redirects to Google's consent screen.
  @UseGuards(GoogleConfiguredGuard, AuthGuard('google'))
  @Get('google')
  googleAuthStart() {
    // AuthGuard('google') intercepts the request and redirects to Google;
    // this method body never actually runs.
  }

  // Step 2 of §17: Google redirects back here with an auth code; Passport's
  // GoogleStrategy exchanges it for a profile (see google.strategy.ts),
  // then we redirect to the frontend with tokens in the query string.
  @UseGuards(GoogleConfiguredGuard, AuthGuard('google'))
  @Get('google/callback')
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    try {
      const { accessToken, refreshToken, user } = await this.googleAuthHandler.execute(req.user, req.ip ?? '0.0.0.0');
      const params = new URLSearchParams({
        accessToken,
        refreshToken,
        user: JSON.stringify(user),
      });
      res.redirect(`${env.frontendUrl}/auth/callback?${params.toString()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      res.redirect(`${env.frontendUrl}/login?error=${encodeURIComponent(message)}`);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('promote-to-creator')
  promote(@CurrentUser() user: any) {
    return this.promoteHandler.execute(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } })) // 5MB, matches §14.5 PROFILE limit
  async uploadAvatar(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, or WEBP images are allowed for avatars');
    }
    const result = await this.storage.upload(file.buffer, file.originalname, 'avatars');
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: result.url, avatarStorage: result.storage },
    });
    return UserMapper.toDto(updated);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { firstName: dto.firstName?.trim() || undefined, lastName: dto.lastName?.trim() ?? undefined },
    });
    return UserMapper.toDto(updated);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: any) {
    const dbUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return UserMapper.toDto(dbUser);
  }
}
