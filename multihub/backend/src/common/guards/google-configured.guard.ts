import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../../config/env';

/**
 * Runs BEFORE AuthGuard('google') so that, when Google OAuth credentials
 * aren't configured, the request fails with a clear 503 instead of Passport
 * throwing an "Unknown authentication strategy 'google'" error (which would
 * happen because GoogleStrategy is only registered as a provider when
 * env.googleOAuthConfigured is true — see auth.module.ts).
 */
@Injectable()
export class GoogleConfiguredGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (!env.googleOAuthConfigured) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.',
      );
    }
    return true;
  }
}
