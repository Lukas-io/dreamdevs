import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEntity } from './entities/activity.entity';
import { IngestionService } from './ingestion.service';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEntity]), AnalyticsModule],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
