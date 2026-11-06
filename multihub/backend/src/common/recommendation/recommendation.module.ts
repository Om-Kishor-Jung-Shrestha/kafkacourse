import { Module } from '@nestjs/common';
import { VectorService } from './vector.service';
import { CooccurrenceService } from './cooccurrence.service';
import { RecommenderService } from './recommender.service';

@Module({
  providers: [VectorService, CooccurrenceService, RecommenderService],
  exports: [VectorService, CooccurrenceService, RecommenderService],
})
export class RecommendationEngineModule {}
