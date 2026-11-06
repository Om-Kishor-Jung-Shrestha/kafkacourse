import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { CreateReviewHandler } from './commands/create-review.handler';

@Module({
  controllers: [ReviewController],
  providers: [CreateReviewHandler],
})
export class ReviewModule {}
