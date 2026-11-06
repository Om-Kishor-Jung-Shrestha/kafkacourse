import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { PinoLoggerService } from '../logger/pino-logger.service';
import { MetricsService } from '../../metrics/metrics.service';

// RULE-14: SMTP email must be sent for key lifecycle events.
// Dev/local default: points at MailHog (docker-compose), which needs no
// auth. Set SMTP_USER + SMTP_PASS (e.g. Gmail, SendGrid) to send real mail
// instead — see env.ts for why `auth` is omitted entirely rather than sent
// empty when unset.
@Injectable()
export class EmailService {
  private transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    ...(env.smtpUser && env.smtpPass ? { auth: { user: env.smtpUser, pass: env.smtpPass } } : {}),
  });

  constructor(private readonly logger: PinoLoggerService, private readonly metrics: MetricsService) {}

  async send(to: string, subject: string, html: string, template = 'generic'): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"${env.smtpFromName}" <${env.smtpFromEmail}>`,
        to,
        subject,
        html,
      });
      this.metrics.emailsSentTotal.inc({ template });
    } catch (err) {
      this.logger.warn(`Email send failed (is MailHog running?): ${(err as Error).message}`, 'EmailService');
    }
  }

  async sendOtp(to: string, code: string, purpose: string): Promise<void> {
    await this.send(
      to,
      `Your MultiHub ${purpose.toLowerCase()} code: ${code}`,
      `<p>Your code is <b>${code}</b>. It expires in 3 minutes.</p>`,
      `otp_${purpose.toLowerCase()}`,
    );
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    await this.send(to, `Welcome to MultiHub, ${name}!`, `<p>Hi ${name}, welcome aboard.</p>`, 'welcome');
  }

  async sendEnrollmentConfirmation(to: string, courseTitle: string): Promise<void> {
    await this.send(to, `You're enrolled in ${courseTitle}!`, `<p>Happy learning.</p>`, 'enrollment_confirmation');
  }

  async sendCourseApproved(to: string, courseTitle: string): Promise<void> {
    await this.send(to, `Your course "${courseTitle}" is live!`, `<p>Congrats, it's published.</p>`, 'course_approved');
  }
}
