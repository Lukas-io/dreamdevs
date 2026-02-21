import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import { ActivityEntity } from './entities/activity.entity';
import { ValidationService } from './validation.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  BATCH_SIZE,
  CONCURRENT_FILE_IMPORTS,
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
    private readonly dataSource: DataSource,
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

    this.logger.log(`Found ${files.length} CSV file(s). Starting import...`);

    await this.dropIndexes();
    const nonEmptyFiles = files.filter((f) => {
      const filePath = path.join(resolvedDir, f);
      if (fs.statSync(filePath).size === 0) {
        this.logger.warn(`[${f}] is empty — skipping`);
        return false;
      }
      return true;
    });

    for (let i = 0; i < nonEmptyFiles.length; i += CONCURRENT_FILE_IMPORTS) {
      const batch = nonEmptyFiles.slice(i, i + CONCURRENT_FILE_IMPORTS);
      const results = await Promise.all(
        batch.map((file) => this.importFile(path.join(resolvedDir, file)).then((r) => ({ file, ...r }))),
      );

      for (const { file, imported, skipped, rows } of results) {
        this.totalImported += imported;
        this.totalSkipped += skipped;
        this.logger.log(`[${file}] imported: ${imported.toLocaleString()}, skipped: ${skipped}`);
      }

      this.logger.log(`Progress: ${this.totalImported.toLocaleString()} total rows imported...`);
    }

    await this.rebuildIndexes();

    this.totalImported = await this.activityRepo.count();

    const stats = this.validationService.getStats();
    this.logger.log(
      `Import complete — rows in DB: ${this.totalImported.toLocaleString()}, skipped: ${this.totalSkipped}` +
        ` | validation: invalidUUID=${stats.invalidUUID}, badMerchantId=${stats.invalidMerchantId}` +
        `, negativeAmount=${stats.negativeAmount}, suspiciousDate=${stats.suspiciousDate}` +
        `, invalidProduct=${stats.invalidProduct}, invalidStatus=${stats.invalidStatus}`,
    );

    if (this.totalImported === 0) {
      this.logger.warn('⚠️  No records were imported. Did you run: bash scripts/download-data.sh ?');
    }

    this.isComplete = true;
    await this.analyticsService.precompute();
  }

  private async importFile(
    filePath: string,
  ): Promise<{ imported: number; skipped: number; rows: number }> {
    let imported = 0;
    let skipped = 0;
    let rowNumber = 0;
    const chunk: Partial<ActivityEntity>[] = [];

    const flush = async () => {
      if (chunk.length === 0) return;
      const batch = chunk.splice(0, chunk.length);
      await this.withRetry(() =>
        this.activityRepo
          .createQueryBuilder()
          .insert()
          .into(ActivityEntity)
          .values(batch)
          .orIgnore()
          .execute(),
      );
      imported += batch.length;
    };

    const parser = fs.createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        bom: true,
      }),
    );

    for await (const record of parser) {
      rowNumber++;
      const row = this.validationService.validate(record as Record<string, string>, rowNumber);

      if (!row) {
        skipped++;
        continue;
      }

      chunk.push(row);

      if (chunk.length >= BATCH_SIZE) {
        await flush();
      }
    }

    await flush();
    return { imported, skipped, rows: rowNumber };
  }

  /** Drops non-PK indexes on activities table for faster bulk inserts */
  private async dropIndexes(): Promise<void> {
    this.logger.log('Dropping indexes for faster import...');
    const indexes: { indexname: string }[] = await this.dataSource.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'activities'
        AND indexname NOT LIKE 'PK_%'
        AND indexname NOT LIKE '%_pkey'
    `);

    for (const { indexname } of indexes) {
      await this.dataSource.query(`DROP INDEX IF EXISTS "${indexname}"`);
    }
    this.logger.log(`Dropped ${indexes.length} index(es).`);
  }

  /** Rebuilds analytics indexes after import. Uses IF NOT EXISTS — safe to call on restart. */
  private async rebuildIndexes(): Promise<void> {
    this.logger.log('Rebuilding indexes...');
    const queries = [
      `CREATE INDEX IF NOT EXISTS "IDX_status_product" ON activities ("status", "product")`,
      `CREATE INDEX IF NOT EXISTS "IDX_merchant_id" ON activities ("merchant_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_event_timestamp" ON activities ("event_timestamp")`,
      `CREATE INDEX IF NOT EXISTS "IDX_merchant_status_product" ON activities ("merchant_id", "status", "product")`,
      `CREATE INDEX IF NOT EXISTS "IDX_timestamp_status" ON activities ("event_timestamp", "status")`,
    ];

    for (const q of queries) {
      await this.dataSource.query(q);
    }
    this.logger.log('Indexes rebuilt.');
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
