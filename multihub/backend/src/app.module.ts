import { Module } from '@nestjs/common';
import { LoggerModule } from './common/logger/logger.module';
import { MetricsModule } from './metrics/metrics.module';
import { JwtGlobalModule } from './common/jwt/jwt-global.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { EventBusModule } from './common/events/event-bus.module';
import { OutboxModule } from './common/outbox/outbox.module';
import { EmailModule } from './common/email/email.module';
import { QueueModule } from './common/queue/queue.module';
import { StorageModule } from './common/storage/storage.module';

import { AuthModule } from './modules/auth/auth.module';
import { CourseModule } from './modules/course/course.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ReviewModule } from './modules/review/review.module';
import { NotificationModule } from './modules/notification/notification.module';
import { RecommendationModule } from './modules/recommendation/recommendation.module';
import { PayoutModule } from './modules/payout/payout.module';
import { SuperAdminModule } from './modules/superadmin/superadmin.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SearchModule } from './modules/search/search.module';
import { CommerceModule } from './modules/commerce/commerce.module';

import { CourseCatalogProjector } from './projectors/course-catalog.projector';
import { LearningSnapshotProjector } from './projectors/learning-snapshot.projector';
import { NotificationInboxProjector } from './projectors/notification-inbox.projector';

@Module({
  imports: [
    LoggerModule,
    MetricsModule,
    JwtGlobalModule,
    QueueModule,
    PrismaModule,
    RedisModule,
    EventBusModule,
    OutboxModule,
    EmailModule,
    StorageModule,
    AuthModule,
    CourseModule,
    EnrollmentModule,
    PaymentModule,
    ReviewModule,
    NotificationModule,
    RecommendationModule,
    PayoutModule,
    SuperAdminModule,
    AdminModule,
    AnalyticsModule,
    SearchModule,
    CommerceModule,
  ],
  providers: [CourseCatalogProjector, LearningSnapshotProjector, NotificationInboxProjector],
})
export class AppModule {}
