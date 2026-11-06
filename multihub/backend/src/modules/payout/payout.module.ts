import { Module } from '@nestjs/common';
import { PayoutController } from './payout.controller';
import { RequestPayoutHandler } from './commands/request-payout.handler';
import { ProcessPayoutHandler } from './commands/process-payout.handler';

@Module({
  controllers: [PayoutController],
  providers: [RequestPayoutHandler, ProcessPayoutHandler],
})
export class PayoutModule {}
