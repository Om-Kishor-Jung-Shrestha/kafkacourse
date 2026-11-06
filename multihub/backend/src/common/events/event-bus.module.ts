import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service';
import { DaprController } from './dapr.controller';

@Global()
@Module({
  controllers: [DaprController],
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventBusModule {}
