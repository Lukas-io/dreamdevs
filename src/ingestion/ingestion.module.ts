import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEntity } from './entities/activity.entity';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEntity])],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
