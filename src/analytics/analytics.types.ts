export interface TopMerchantResult {
  merchant_id: string;
  total_volume: number;
}

export interface MonthlyActiveMerchantsResult {
  [month: string]: number;
}

export interface ProductAdoptionResult {
  [product: string]: number;
}

export interface KycFunnelResult {
  documents_submitted: number;
  verifications_completed: number;
  tier_upgrades: number;
}

export interface FailureRateEntry {
  product: string;
  failure_rate: number;
}

export interface AnalyticsCache {
  topMerchant: TopMerchantResult | null;
  monthlyActiveMerchants: MonthlyActiveMerchantsResult;
  productAdoption: ProductAdoptionResult;
  kycFunnel: KycFunnelResult;
  failureRates: FailureRateEntry[];
}
