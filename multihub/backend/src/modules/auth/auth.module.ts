import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { RegisterUserHandler } from './commands/register-user.handler';
import { LoginUserHandler } from './commands/login-user.handler';
import { OtpHandler } from './commands/otp.handler';
import { PromoteToCreatorHandler } from './commands/promote-to-creator.handler';
import { RefreshTokenHandler } from './commands/refresh-token.handler';
import { GoogleAuthHandler } from './commands/google-auth.handler';
import { GoogleStrategy } from './strategies/google.strategy';
import { GoogleConfiguredGuard } from '../../common/guards/google-configured.guard';
import { env } from '../../config/env';

// JwtService comes from JwtGlobalModule (registered once, @Global(), in
// AppModule) — not registered here anymore, so there's exactly one
// JwtModule.register(...) call/config in the whole app. See
// common/jwt/jwt-global.module.ts for why.
@Module({
  imports: [PassportModule],
  controllers: [AuthController],
  providers: [
    RegisterUserHandler,
    LoginUserHandler,
    OtpHandler,
    PromoteToCreatorHandler,
    GoogleAuthHandler,
    RefreshTokenHandler,
    GoogleConfiguredGuard,
    // Only registered when Google OAuth is actually configured — the
    // passport-google-oauth20 Strategy constructor throws synchronously if
    // clientID/clientSecret are empty, which would otherwise crash the
    // whole app at boot for anyone who hasn't set up Google OAuth yet.
    // GoogleConfiguredGuard (see auth.controller.ts) returns a clean 503
    // on the /google routes instead when this provider is absent.
    ...(env.googleOAuthConfigured ? [GoogleStrategy] : []),
  ],
})
export class AuthModule {}
