import { AnalyticsService } from './analytics.service';

/** Build a mock DataSource that returns specified rows for each query call */
function makeDataSource(responses: unknown[][]) {
  let call = 0;
  return {
    query: jest.fn(() => Promise.resolve(responses[call++] ?? [])),
  };
}

describe('AnalyticsService', () => {
  describe('getTopMerchant', () => {
    it('returns null before precompute', () => {
      const service = new AnalyticsService(makeDataSource([]) as any);
      expect(service.getTopMerchant()).toBeNull();
    });

    it('returns the top merchant after precompute', async () => {
      const ds = makeDataSource([
        [{ merchant_id: 'MRC-001234', total_volume: '98765432.10' }], // top-merchant
        [],  // monthly-active
        [],  // product-adoption
        [],  // kyc-funnel
        [],  // failure-rates
      ]);
      const service = new AnalyticsService(ds as any);
      await service.precompute();

      const result = service.getTopMerchant();
      expect(result).not.toBeNull();
      expect(result?.merchant_id).toBe('MRC-001234');
      expect(result?.total_volume).toBe(98765432.1);
    });

    it('returns null when no SUCCESS transactions exist', async () => {
      const ds = makeDataSource([[], [], [], [], []]);
      const service = new AnalyticsService(ds as any);
      await service.precompute();
      expect(service.getTopMerchant()).toBeNull();
    });
  });

  describe('getMonthlyActiveMerchants', () => {
    it('returns an empty object before precompute', () => {
      const service = new AnalyticsService(makeDataSource([]) as any);
      expect(service.getMonthlyActiveMerchants()).toEqual({});
    });

    it('returns months keyed by YYYY-MM with correct counts', async () => {
      const ds = makeDataSource([
        [],  // top-merchant
        [    // monthly-active
          { month: '2024-01', merchant_count: 9847 },
          { month: '2024-02', merchant_count: 9901 },
          { month: '2024-12', merchant_count: 10234 },
        ],
        [], [], [],
      ]);
      const service = new AnalyticsService(ds as any);
      await service.precompute();

      const result = service.getMonthlyActiveMerchants();
      expect(result['2024-01']).toBe(9847);
      expect(result['2024-02']).toBe(9901);
      expect(result['2024-12']).toBe(10234);
      expect(Object.keys(result)).toHaveLength(3);
    });
  });

  describe('getProductAdoption', () => {
    it('returns an empty object before precompute', () => {
      const service = new AnalyticsService(makeDataSource([]) as any);
      expect(service.getProductAdoption()).toEqual({});
    });

    it('returns products sorted by merchant count descending', async () => {
      const ds = makeDataSource([
        [], [],
        [   // product-adoption — already sorted by SQL
          { product: 'BILLS', merchant_count: 4379 },
          { product: 'POS', merchant_count: 4348 },
          { product: 'KYC', merchant_count: 4167 },
        ],
        [], [],
      ]);
      const service = new AnalyticsService(ds as any);
      await service.precompute();

      const result = service.getProductAdoption();
      const keys = Object.keys(result);
      expect(keys[0]).toBe('BILLS');
      expect(keys[1]).toBe('POS');
      expect(keys[2]).toBe('KYC');
      expect(result['BILLS']).toBe(4379);
    });
  });

  describe('getKycFunnel', () => {
    it('returns all zeros before precompute', () => {
      const service = new AnalyticsService(makeDataSource([]) as any);
      expect(service.getKycFunnel()).toEqual({
        documents_submitted: 0,
        verifications_completed: 0,
        tier_upgrades: 0,
      });
    });

    it('maps event_type rows to funnel keys', async () => {
      const ds = makeDataSource([
        [], [], [],
        [   // kyc-funnel
          { event_type: 'DOCUMENT_SUBMITTED', merchant_count: 3760 },
          { event_type: 'VERIFICATION_COMPLETED', merchant_count: 3389 },
          { event_type: 'TIER_UPGRADE', merchant_count: 2496 },
        ],
        [],
      ]);
      const service = new AnalyticsService(ds as any);
      await service.precompute();

      const result = service.getKycFunnel();
      expect(result.documents_submitted).toBe(3760);
      expect(result.verifications_completed).toBe(3389);
      expect(result.tier_upgrades).toBe(2496);
    });

    it('defaults missing stages to 0', async () => {
      const ds = makeDataSource([
        [], [], [],
        [{ event_type: 'DOCUMENT_SUBMITTED', merchant_count: 500 }],
        [],
      ]);
      const service = new AnalyticsService(ds as any);
      await service.precompute();

      const result = service.getKycFunnel();
      expect(result.documents_submitted).toBe(500);
      expect(result.verifications_completed).toBe(0);
      expect(result.tier_upgrades).toBe(0);
    });
  });

  describe('getFailureRates', () => {
    it('returns an empty array before precompute', () => {
      const service = new AnalyticsService(makeDataSource([]) as any);
      expect(service.getFailureRates()).toEqual([]);
    });

    it('returns products sorted by failure rate descending', async () => {
      const ds = makeDataSource([
        [], [], [], [],
        [   // failure-rates — already sorted by SQL
          { product: 'BILLS', failure_rate: '5.3' },
          { product: 'CARD_PAYMENT', failure_rate: '5.2' },
          { product: 'KYC', failure_rate: '4.1' },
        ],
      ]);
      const service = new AnalyticsService(ds as any);
      await service.precompute();

      const result = service.getFailureRates();
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ product: 'BILLS', failure_rate: 5.3 });
      expect(result[1]).toEqual({ product: 'CARD_PAYMENT', failure_rate: 5.2 });
      expect(result[2]).toEqual({ product: 'KYC', failure_rate: 4.1 });
    });
  });

  describe('precompute resilience', () => {
    it('sets isReady = true after successful precompute', async () => {
      const ds = makeDataSource([[], [], [], [], []]);
      const service = new AnalyticsService(ds as any);
      expect(service.isReady).toBe(false);
      await service.precompute();
      expect(service.isReady).toBe(true);
    });

    it('retries once on failure and gives up after 2 attempts', async () => {
      jest.useFakeTimers();
      const ds = { query: jest.fn().mockRejectedValue(new Error('DB down')) };
      const service = new AnalyticsService(ds as any);

      const precomputePromise = service.precompute();
      // Advance past the 5-second retry delay
      await jest.runAllTimersAsync();
      await precomputePromise;

      // query was attempted twice (once per precompute call, 5 queries each)
      expect(ds.query).toHaveBeenCalledTimes(10);
      expect(service.isReady).toBe(false);
      jest.useRealTimers();
    });
  });
});
