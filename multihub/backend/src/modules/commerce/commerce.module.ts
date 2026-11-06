import { Module } from '@nestjs/common';
import { CartController, WishlistController } from './commerce.controller';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';

@Module({
  controllers: [CartController, WishlistController, CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CommerceModule {}
