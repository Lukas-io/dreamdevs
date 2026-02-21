import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ActivityEntity } from './entities/activity.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';

const CHUNK_SIZE = 1000;

@Injectable()
export class IngestionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionService.name);

  totalImported = 0;
  totalSkipped = 0;
  isComplete = false;

  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepo: Repository<ActivityEntity>,
    private readonly config: ConfigService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async onApplicationBootstrap() {
    await this.importAll();
  }

  async importAll() {
    const dataDir = this.config.get<string>('DATA_DIR') || './data';
    const resolvedDir = path.resolve(dataDir);

    if (!fs.existsSync(resolvedDir)) {
      this.logger.warn(`Data directory not found: ${resolvedDir}. Skipping import.`);
      this.isComplete = true;
      return;
    }

    const files = fs
      .readdirSync(resolvedDir)
      .filter((f) => f.match(/^activities_\d{8}\.csv$/))
      .sort();

    if (files.length === 0) {
      this.logger.warn('No CSV files found in data directory.');
      this.isComplete = true;
      return;
    }

    // Check if DB already has data — skip import if so, go straight to precompute
    const existingCount = await this.activityRepo.count();
    if (existingCount > 0) {
      this.logger.log(
        `Database already contains ${existingCount.toLocaleString()} records. Skipping import.`,
      );
      this.totalImported = existingCount;
      this.isComplete = true;
      await this.analyticsService.precompute();
      return;
    }

    this.logger.log(`Found ${files.length} CSV file(s). Starting import...`);

    for (const file of files) {
      const filePath = path.join(resolvedDir, file);
      const { imported, skipped } = await this.importFile(filePath);
      this.totalImported += imported;
      this.totalSkipped += skipped;
      this.logger.log(`[${file}] imported: ${imported}, skipped: ${skipped}`);
    }

    this.isComplete = true;
    this.logger.log(
      `Import complete. Total imported: ${this.totalImported}, total skipped: ${this.totalSkipped}`,
    );

    await this.analyticsService.precompute();
  }

  private importFile(filePath: string): Promise<{ imported: number; skipped: number }> {
    return new Promise((resolve, reject) => {
      let imported = 0;
      let skipped = 0;
      const chunk: Partial<ActivityEntity>[] = [];

      const flush = async () => {
        if (chunk.length === 0) return;
        const batch = chunk.splice(0, chunk.length);
        await this.activityRepo
          .createQueryBuilder()
          .insert()
          .into(ActivityEntity)
          .values(batch)
          .orIgnore()
          .execute();
        imported += batch.length;
      };

      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });

      parser.on('readable', async () => {
        let record: Record<string, string>;
        while ((record = parser.read()) !== null) {
          const row = this.parseRow(record);
          if (!row) {
            skipped++;
            continue;
          }
          chunk.push(row);
          if (chunk.length >= CHUNK_SIZE) {
            parser.pause();
            await flush();
            parser.resume();
          }
        }
      });

      parser.on('error', (err) => {
        this.logger.error(`Parse error in ${filePath}: ${err.message}`);
        reject(err);
      });

      parser.on('end', async () => {
        try {
          await flush();
          resolve({ imported, skipped });
        } catch (err) {
          reject(err);
        }
      });

      fs.createReadStream(filePath).pipe(parser);
    });
  }

  private parseRow(record: Record<string, string>): Partial<ActivityEntity> | null {
    try {
      const {
        event_id,
        merchant_id,
        event_timestamp,
        product,
        event_type,
        amount,
        status,
        channel,
        region,
        merchant_tier,
      } = record;

      // Must-have fields
      if (!event_id || !merchant_id || !product || !event_type || !status) return null;

      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(event_id)) return null;

      // Parse timestamp — allow null for missing/malformed
      let parsedTimestamp: Date | null = null;
      if (event_timestamp && event_timestamp.trim() !== '') {
        const d = new Date(event_timestamp);
        parsedTimestamp = isNaN(d.getTime()) ? null : d;
      }

      // Parse amount — default to 0 for non-monetary events
      const parsedAmount = parseFloat(amount);
      const safeAmount = isNaN(parsedAmount) ? 0 : parsedAmount;

      return {
        event_id,
        merchant_id,
        event_timestamp: parsedTimestamp,
        product,
        event_type,
        amount: safeAmount,
        status,
        channel: channel || null,
        region: region || null,
        merchant_tier: merchant_tier || null,
      };
    } catch {
      return null;
    }
  }
}
