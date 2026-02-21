import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { IngestionModule } from '../ingestion/ingestion.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [IngestionModule, AnalyticsModule],
  controllers: [HealthController],
})
export class HealthModule {}
