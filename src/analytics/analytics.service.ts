import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AnalyticsCache,
  FailureRateEntry,
  KycFunnelResult,
  MonthlyActiveMerchantsResult,
  ProductAdoptionResult,
  TopMerchantResult,
} from './analytics.types';
import { SLOW_QUERY_THRESHOLD_MS } from '../common/constants';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private cache: AnalyticsCache | null = null;
  isReady = false;

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Runs all 5 analytics queries in parallel and stores results in memory.
   * If any query fails, the error is logged but the app does not crash —
   * a partial or stale cache is better than no data at all.
   */
  async precompute(): Promise<void> {
    this.logger.log('Pre-computing analytics...');
    const start = Date.now();

    try {
      const [topMerchant, monthlyActiveMerchants, productAdoption, kycFunnel, failureRates] =
        await Promise.all([
          this.timed('top-merchant', () => this.queryTopMerchant()),
          this.timed('monthly-active-merchants', () => this.queryMonthlyActiveMerchants()),
          this.timed('product-adoption', () => this.queryProductAdoption()),
          this.timed('kyc-funnel', () => this.queryKycFunnel()),
          this.timed('failure-rates', () => this.queryFailureRates()),
        ]);

      this.cache = {
        topMerchant,
        monthlyActiveMerchants,
        productAdoption,
        kycFunnel,
        failureRates,
      };

      this.isReady = true;

      const totalMs = Date.now() - start;
      const heapMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      this.logger.log(
        `Analytics ready in ${totalMs}ms. Heap used: ${heapMB}MB`,
      );
    } catch (err) {
      // Don't crash — serve whatever is already cached (or nothing with 503)
      this.logger.error(
        `Pre-computation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Returns the top merchant by total successful transaction volume */
  getTopMerchant(): TopMerchantResult | null {
    return this.cache?.topMerchant ?? null;
  }

  /** Returns unique active merchant count per month */
  getMonthlyActiveMerchants(): MonthlyActiveMerchantsResult {
    return this.cache?.monthlyActiveMerchants ?? {};
  }

  /** Returns unique merchant count per product, sorted descending */
  getProductAdoption(): ProductAdoptionResult {
    return this.cache?.productAdoption ?? {};
  }

  /** Returns KYC conversion funnel counts */
  getKycFunnel(): KycFunnelResult {
    return (
      this.cache?.kycFunnel ?? {
        documents_submitted: 0,
        verifications_completed: 0,
        tier_upgrades: 0,
      }
    );
  }

  /** Returns failure rates per product, sorted descending */
  getFailureRates(): FailureRateEntry[] {
    return this.cache?.failureRates ?? [];
  }

  /**
   * Wraps a query in execution-time logging.
   * Warns if the query exceeds SLOW_QUERY_THRESHOLD_MS.
   */
  private async timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const result = await fn();
    const ms = Date.now() - start;

    if (ms > SLOW_QUERY_THRESHOLD_MS) {
      this.logger.warn(`Slow query [${name}]: ${ms}ms`);
    } else {
      this.logger.log(`Query [${name}]: ${ms}ms`);
    }

    return result;
  }

  private async queryTopMerchant(): Promise<TopMerchantResult | null> {
    const rows = await this.dataSource.query(`
      SELECT merchant_id, ROUND(SUM(amount)::numeric, 2) AS total_volume
      FROM activities
      WHERE status = 'SUCCESS'
      GROUP BY merchant_id
      ORDER BY total_volume DESC
      LIMIT 1
    `);

    if (!rows.length) return null;
    return {
      merchant_id: rows[0].merchant_id,
      total_volume: parseFloat(rows[0].total_volume),
    };
  }

  private async queryMonthlyActiveMerchants(): Promise<MonthlyActiveMerchantsResult> {
    const rows = await this.dataSource.query(`
      SELECT
        TO_CHAR(event_timestamp, 'YYYY-MM') AS month,
        COUNT(DISTINCT merchant_id)::int AS merchant_count
      FROM activities
      WHERE status = 'SUCCESS'
        AND event_timestamp IS NOT NULL
      GROUP BY month
      ORDER BY month
    `);

    return rows.reduce(
      (acc: MonthlyActiveMerchantsResult, row: { month: string; merchant_count: number }) => {
        acc[row.month] = row.merchant_count;
        return acc;
      },
      {},
    );
  }

  private async queryProductAdoption(): Promise<ProductAdoptionResult> {
    const rows = await this.dataSource.query(`
      SELECT product, COUNT(DISTINCT merchant_id)::int AS merchant_count
      FROM activities
      GROUP BY product
      ORDER BY merchant_count DESC
    `);

    return rows.reduce(
      (acc: ProductAdoptionResult, row: { product: string; merchant_count: number }) => {
        acc[row.product] = row.merchant_count;
        return acc;
      },
      {},
    );
  }

  private async queryKycFunnel(): Promise<KycFunnelResult> {
    const rows = await this.dataSource.query(`
      SELECT event_type, COUNT(DISTINCT merchant_id)::int AS merchant_count
      FROM activities
      WHERE product = 'KYC'
        AND status = 'SUCCESS'
      GROUP BY event_type
    `);

    const map: Record<string, number> = {};
    for (const row of rows) {
      map[row.event_type] = row.merchant_count;
    }

    return {
      documents_submitted: map['DOCUMENT_SUBMITTED'] ?? 0,
      verifications_completed: map['VERIFICATION_COMPLETED'] ?? 0,
      tier_upgrades: map['TIER_UPGRADE'] ?? 0,
    };
  }

  private async queryFailureRates(): Promise<FailureRateEntry[]> {
    const rows = await this.dataSource.query(`
      SELECT
        product,
        ROUND(
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END)::numeric * 100.0 /
          NULLIF(COUNT(CASE WHEN status IN ('SUCCESS', 'FAILED') THEN 1 END), 0),
          1
        ) AS failure_rate
      FROM activities
      WHERE status IN ('SUCCESS', 'FAILED')
      GROUP BY product
      ORDER BY failure_rate DESC
    `);

    return rows.map((row: { product: string; failure_rate: string }) => ({
      product: row.product,
      failure_rate: parseFloat(row.failure_rate),
    }));
  }
}
