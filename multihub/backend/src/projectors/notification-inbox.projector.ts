import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { EventBusService, DomainEvent } from '../common/events/event-bus.service';

// Fans out a handful of domain events into user-facing notifications.
@Injectable()
export class NotificationInboxProjector implements OnModuleInit {
  constructor(private prisma: PrismaService, private bus: EventBusService) {}

  onModuleInit() {
    this.bus.subscribe('course.published', (e) => this.notify(e, 'COURSE_UPDATE', 'Course published', `Your course is now live.`));
    this.bus.subscribe('enrollment.created', (e) => this.notify(e, 'ENROLLMENT', 'New enrollment', `You have a new enrollment.`, true));
    this.bus.subscribe('payment.completed', (e) => this.notify(e, 'PAYMENT', 'Payment received', `Your payment was processed successfully.`));
    this.bus.subscribe('review.created', (e) => this.notify(e, 'REVIEW', 'New review', `Your course received a new review.`, true));
    this.bus.subscribe('payout.requested', (e) => this.notifyPayout(e, 'Payout requested', 'Your payout request has been submitted.'));
    this.bus.subscribe('payout.processed', (e) => this.notifyPayout(e, 'Payout processed', `Your payout status is now ${e.payload.status}.`));
    this.bus.subscribe('course.rejected', (e) => this.notify(e, 'COURSE_UPDATE', 'Course needs changes', 'Your course submission needs updates before it can be published.', true));
  }

  private async notifyPayout(event: DomainEvent, title: string, message: string) {
    const creatorId = event.payload.creatorId as string | undefined;
    if (!creatorId) return;
    const notif = await this.prisma.notification.create({
      data: { userId: creatorId, type: 'PAYMENT', title, message, metadata: event.payload as any },
    });
    await this.prisma.rmNotificationInbox.create({
      data: { id: notif.id, userId: creatorId, type: notif.type, title: notif.title, message: notif.message, createdAt: notif.createdAt },
    });
  }

  private async notify(event: DomainEvent, type: string, title: string, message: string, toCreator = false) {
    let userId = event.payload.userId as string | undefined;
    if (toCreator && event.payload.courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: event.payload.courseId as string } });
      userId = course?.creatorId;
    }
    if (!userId) return;

    const notif = await this.prisma.notification.create({
      data: { userId, type: type as any, title, message, metadata: event.payload as any },
    });
    await this.prisma.rmNotificationInbox.create({
      data: { id: notif.id, userId, type: notif.type, title: notif.title, message: notif.message, createdAt: notif.createdAt },
    });
  }
}
