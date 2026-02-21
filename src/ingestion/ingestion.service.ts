import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import { ActivityEntity } from './entities/activity.entity';
import { ValidationService } from './validation.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  BATCH_SIZE,
  LOG_PROGRESS_EVERY,
  MAX_RETRIES,
  RETRY_DELAY_MS,
} from '../common/constants';

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
    private readonly validationService: ValidationService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  onApplicationBootstrap() {
  this.importAll().catch((err) =>
      this.logger.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  /** Scans DATA_DIR for CSV files and imports them if the DB is empty */
  async importAll(): Promise<void> {
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

    // Skip import if DB already has data — safe to restart without re-processing
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

    let globalRowCount = 0;
    let lastLoggedAt = 0;

    for (const file of files) {
      const filePath = path.join(resolvedDir, file);

      if (fs.statSync(filePath).size === 0) {
        this.logger.warn(`[${file}] is empty — skipping`);
        continue;
      }

      const { imported, skipped, rows } = await this.importFile(filePath);
      this.totalImported += imported;
      this.totalSkipped += skipped;
      globalRowCount += rows;

      this.logger.log(`[${file}] imported: ${imported.toLocaleString()}, skipped: ${skipped}`);

      // Log cumulative progress every LOG_PROGRESS_EVERY rows
      if (globalRowCount - lastLoggedAt >= LOG_PROGRESS_EVERY) {
        this.logger.log(`Progress: ${globalRowCount.toLocaleString()} total rows processed...`);
        lastLoggedAt = globalRowCount;
      }
    }

    // Log validation stats summary
    const stats = this.validationService.getStats();
    this.logger.log(
      `Import complete — imported: ${this.totalImported.toLocaleString()}, skipped: ${this.totalSkipped}` +
        ` | validation: invalidUUID=${stats.invalidUUID}, badMerchantId=${stats.invalidMerchantId}` +
        `, negativeAmount=${stats.negativeAmount}, suspiciousDate=${stats.suspiciousDate}` +
        `, invalidProduct=${stats.invalidProduct}, invalidStatus=${stats.invalidStatus}`,
    );

    this.isComplete = true;
    await this.analyticsService.precompute();
  }

  private importFile(
    filePath: string,
  ): Promise<{ imported: number; skipped: number; rows: number }> {
    return new Promise((resolve, reject) => {
      let imported = 0;
      let skipped = 0;
      let rowNumber = 0;
      const chunk: Partial<ActivityEntity>[] = [];

      const flush = async () => {
        if (chunk.length === 0) return;
        const batch = chunk.splice(0, chunk.length);
        // Retry transient DB errors with exponential backoff
        await this.withRetry(() =>
          this.activityRepo
            .createQueryBuilder()
            .insert()
            .into(ActivityEntity)
            .values(batch)
            .orIgnore() // idempotent — safe on re-runs
            .execute(),
        );
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
          rowNumber++;
          const row = this.validationService.validate(record, rowNumber);

          if (!row) {
            skipped++;
            continue;
          }

          chunk.push(row);

          if (chunk.length >= BATCH_SIZE) {
            parser.pause();
            await flush();
            parser.resume();
          }
        }
      });

      parser.on('error', (err) => {
        this.logger.error(`Parse error in ${path.basename(filePath)}: ${err.message}`);
        reject(err);
      });

      parser.on('end', async () => {
        try {
          await flush();
          resolve({ imported, skipped, rows: rowNumber });
        } catch (err) {
          reject(err);
        }
      });

      fs.createReadStream(filePath).pipe(parser);
    });
  }

  /**
   * Retries a DB operation up to MAX_RETRIES times with exponential backoff.
   * Designed for transient errors (e.g. connection blips under load).
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    retries: number = MAX_RETRIES,
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err as Error;
        if (attempt < retries) {
          const delay = RETRY_DELAY_MS * attempt;
          this.logger.warn(
            `DB write failed (attempt ${attempt}/${retries}), retrying in ${delay}ms: ${lastError.message}`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  }
}
