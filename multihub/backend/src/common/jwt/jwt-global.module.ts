import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../../config/env';

/**
 * JwtAuthGuard (used by nearly every protected controller across the app —
 * course, enrollment, payment, payout, review, notification, admin,
 * superadmin, analytics, recommendation, plus auth itself) depends on
 * JwtService via constructor injection. Nest resolves a guard's
 * dependencies from the providers visible to the module that declares the
 * controller it's guarding — so without this, every one of those modules
 * would need its own `imports: [AuthModule]` just to satisfy that single
 * shared dependency, and forgetting even one causes a boot-time
 * `UnknownDependenciesException` for JwtAuthGuard in that module.
 *
 * Registering JwtModule here, as a `@Global()` module imported once in
 * AppModule, makes JwtService available everywhere without every module
 * needing to know or care where it comes from — this is what actually
 * fixes that class of error, root cause rather than module-by-module.
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: env.jwtAccessSecret,
      signOptions: { expiresIn: env.jwtAccessExpiresIn as any },
    }),
  ],
  exports: [JwtModule],
})
export class JwtGlobalModule {}
