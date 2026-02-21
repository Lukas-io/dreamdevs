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

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private cache: AnalyticsCache | null = null;
  isReady = false;

  constructor(private readonly dataSource: DataSource) {}

  async precompute(): Promise<void> {
    this.logger.log('Pre-computing analytics...');

    const [topMerchant, monthlyActiveMerchants, productAdoption, kycFunnel, failureRates] =
      await Promise.all([
        this.queryTopMerchant(),
        this.queryMonthlyActiveMerchants(),
        this.queryProductAdoption(),
        this.queryKycFunnel(),
        this.queryFailureRates(),
      ]);

    this.cache = {
      topMerchant,
      monthlyActiveMerchants,
      productAdoption,
      kycFunnel,
      failureRates,
    };

    this.isReady = true;
    this.logger.log('Analytics pre-computation complete.');
  }

  getTopMerchant(): TopMerchantResult | null {
    return this.cache?.topMerchant ?? null;
  }

  getMonthlyActiveMerchants(): MonthlyActiveMerchantsResult {
    return this.cache?.monthlyActiveMerchants ?? {};
  }

  getProductAdoption(): ProductAdoptionResult {
    return this.cache?.productAdoption ?? {};
  }

  getKycFunnel(): KycFunnelResult {
    return this.cache?.kycFunnel ?? { documents_submitted: 0, verifications_completed: 0, tier_upgrades: 0 };
  }

  getFailureRates(): FailureRateEntry[] {
    return this.cache?.failureRates ?? [];
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
