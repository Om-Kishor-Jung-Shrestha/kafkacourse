import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { CheckoutHandler } from './commands/checkout.handler';
import { CommerceModule } from '../commerce/commerce.module';

@Module({
  imports: [CommerceModule],
  controllers: [PaymentController],
  providers: [CheckoutHandler],
})
export class PaymentModule {}
