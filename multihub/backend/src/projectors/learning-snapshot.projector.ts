import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { EventBusService, DomainEvent } from '../common/events/event-bus.service';

@Injectable()
export class LearningSnapshotProjector implements OnModuleInit {
  constructor(private prisma: PrismaService, private bus: EventBusService) {}

  onModuleInit() {
    this.bus.subscribe('enrollment.created', (e) => this.rebuild(e));
    this.bus.subscribe('enrollment.completed', (e) => this.rebuild(e));
    this.bus.subscribe('payment.completed', (e) => this.rebuild(e));
  }

  private async rebuild(event: DomainEvent) {
    const userId = event.payload.userId as string;
    if (!userId) return;

    const [enrollments, payments] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId } }),
      this.prisma.payment.findMany({ where: { userId, status: 'COMPLETED' } }),
    ]);

    await this.prisma.rmUserLearningSnapshot.upsert({
      where: { userId },
      create: {
        userId,
        enrolledCoursesCount: enrollments.length,
        completedCoursesCount: enrollments.filter((e) => e.status === 'COMPLETED').length,
        totalSpentCents: payments.reduce((s, p) => s + p.amountCents, 0),
        lastActivityDate: new Date(),
      },
      update: {
        enrolledCoursesCount: enrollments.length,
        completedCoursesCount: enrollments.filter((e) => e.status === 'COMPLETED').length,
        totalSpentCents: payments.reduce((s, p) => s + p.amountCents, 0),
        lastActivityDate: new Date(),
        projectedAt: new Date(),
      },
    });
  }
}
