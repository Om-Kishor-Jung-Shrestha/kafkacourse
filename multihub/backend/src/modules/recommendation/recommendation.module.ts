import { Module } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { RecommendationEngineModule } from '../../common/recommendation/recommendation.module';

@Module({
  imports: [RecommendationEngineModule],
  controllers: [RecommendationController],
})
export class RecommendationModule {}
