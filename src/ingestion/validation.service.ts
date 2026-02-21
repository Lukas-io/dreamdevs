import { Injectable, Logger } from '@nestjs/common';
import { ActivityEntity } from './entities/activity.entity';
import {
  DATA_YEAR,
  MERCHANT_ID_REGEX,
  UUID_REGEX,
  VALID_CHANNELS,
  VALID_PRODUCTS,
  VALID_STATUSES,
  VALID_TIERS,
} from '../common/constants';

export interface ValidationStats {
  total: number;
  missingFields: number;
  invalidUUID: number;
  invalidMerchantId: number;
  invalidProduct: number;
  invalidStatus: number;
  invalidChannel: number;
  invalidTier: number;
  negativeAmount: number;
  suspiciousDate: number;
}

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  private stats: ValidationStats = {
    total: 0,
    missingFields: 0,
    invalidUUID: 0,
    invalidMerchantId: 0,
    invalidProduct: 0,
    invalidStatus: 0,
    invalidChannel: 0,
    invalidTier: 0,
    negativeAmount: 0,
    suspiciousDate: 0,
  };

  /**
   * Validates and sanitizes a raw CSV row.
   * Returns a clean entity-ready object, or null if the row must be skipped.
   * Logs a warning for every rejected or suspicious field.
   */
  validate(
    record: Record<string, string>,
    rowNumber: number,
  ): Partial<ActivityEntity> | null {
    this.stats.total++;

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

    // Required fields — skip row if any are missing
    if (!event_id || !merchant_id || !product || !event_type || !status) {
      this.stats.missingFields++;
      this.logger.warn(`Row ${rowNumber}: missing required field(s) — skipping`);
      return null;
    }

    // UUID must be valid — it is the primary key
    if (!UUID_REGEX.test(event_id)) {
      this.stats.invalidUUID++;
      this.logger.warn(`Row ${rowNumber}: invalid UUID "${event_id}" — skipping`);
      return null;
    }

    // Product must be a known value — determines query segmentation
    if (!VALID_PRODUCTS.has(product)) {
      this.stats.invalidProduct++;
      this.logger.warn(`Row ${rowNumber}: unknown product "${product}" — skipping`);
      return null;
    }

    // Status must be a known value — used in all analytics filters
    if (!VALID_STATUSES.has(status)) {
      this.stats.invalidStatus++;
      this.logger.warn(`Row ${rowNumber}: unknown status "${status}" — skipping`);
      return null;
    }

    // Merchant ID pattern — warn but still import (identifier may differ in test data)
    if (!MERCHANT_ID_REGEX.test(merchant_id)) {
      this.stats.invalidMerchantId++;
      this.logger.warn(`Row ${rowNumber}: merchant_id "${merchant_id}" does not match MRC-XXXXXX`);
    }

    // Channel is optional — warn and nullify if unrecognised
    const safeChannel = channel?.trim() || null;
    if (safeChannel && !VALID_CHANNELS.has(safeChannel)) {
      this.stats.invalidChannel++;
      this.logger.warn(`Row ${rowNumber}: unknown channel "${safeChannel}" — storing as null`);
    }

    // Merchant tier is optional — warn and nullify if unrecognised
    const safeTier = merchant_tier?.trim() || null;
    if (safeTier && !VALID_TIERS.has(safeTier)) {
      this.stats.invalidTier++;
      this.logger.warn(`Row ${rowNumber}: unknown merchant_tier "${safeTier}" — storing as null`);
    }

    // Amount — default to 0 for non-monetary events; clamp negatives
    const parsedAmount = parseFloat(amount);
    const safeAmount = isNaN(parsedAmount) ? 0 : parsedAmount;
    if (parsedAmount < 0) {
      this.stats.negativeAmount++;
      this.logger.warn(`Row ${rowNumber}: negative amount ${parsedAmount} — clamping to 0`);
    }

    // Timestamp — allow null for missing values; flag out-of-range dates
    let parsedTimestamp: Date | null = null;
    if (event_timestamp?.trim()) {
      const d = new Date(event_timestamp);
      if (!isNaN(d.getTime())) {
        parsedTimestamp = d;
        if (d.getFullYear() !== DATA_YEAR) {
          this.stats.suspiciousDate++;
          this.logger.warn(
            `Row ${rowNumber}: timestamp outside ${DATA_YEAR} (${event_timestamp}) — importing anyway`,
          );
        }
      }
    }

    return {
      event_id,
      merchant_id,
      event_timestamp: parsedTimestamp,
      product,
      event_type,
      amount: Math.max(0, safeAmount),
      status,
      channel: safeChannel && VALID_CHANNELS.has(safeChannel) ? safeChannel : null,
      region: region?.trim() || null,
      merchant_tier: safeTier && VALID_TIERS.has(safeTier) ? safeTier : null,
    };
  }

  /** Returns a snapshot of current validation stats */
  getStats(): ValidationStats {
    return { ...this.stats };
  }

  /** Resets stats — call between import runs if needed */
  resetStats(): void {
    Object.keys(this.stats).forEach(
      (k) => (this.stats[k as keyof ValidationStats] = 0),
    );
  }
}
