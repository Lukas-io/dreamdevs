/** Rows per batch for bulk DB inserts */
export const BATCH_SIZE = 5000;

/** Max concurrent file imports — keep low enough not to overwhelm free-tier DB connections */
export const CONCURRENT_FILE_IMPORTS = 2;

/** Max DB write retry attempts on transient errors */
export const MAX_RETRIES = 3;

/** Base delay (ms) between retries — multiplied by attempt number */
export const RETRY_DELAY_MS = 500;

/** Expected data year — timestamps outside this are flagged */
export const DATA_YEAR = 2024;

/** Allowed product values */
export const VALID_PRODUCTS = new Set([
  'POS', 'AIRTIME', 'BILLS', 'CARD_PAYMENT', 'SAVINGS', 'MONIEBOOK', 'KYC',
]);

/** Allowed status values */
export const VALID_STATUSES = new Set(['SUCCESS', 'FAILED', 'PENDING']);

/** Allowed channel values */
export const VALID_CHANNELS = new Set(['POS', 'APP', 'USSD', 'WEB', 'OFFLINE']);

/** Allowed merchant tier values */
export const VALID_TIERS = new Set(['STARTER', 'VERIFIED', 'PREMIUM']);

/** Expected merchant ID format: MRC- followed by exactly 6 digits */
export const MERCHANT_ID_REGEX = /^MRC-\d{6}$/;

/** Standard UUID v4 format */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Warn if analytics query exceeds this threshold (ms) */
export const SLOW_QUERY_THRESHOLD_MS = 100;
