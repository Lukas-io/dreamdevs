import { ValidationService } from './validation.service';

describe('ValidationService', () => {
  let service: ValidationService;

  const validRow = () => ({
    event_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    merchant_id: 'MRC-123456',
    event_timestamp: '2024-03-15T10:30:00.000Z',
    product: 'POS',
    event_type: 'CARD_TRANSACTION',
    amount: '1500.00',
    status: 'SUCCESS',
    channel: 'APP',
    region: 'LAGOS',
    merchant_tier: 'VERIFIED',
  });

  beforeEach(() => {
    service = new ValidationService();
  });

  describe('valid row', () => {
    it('returns a clean entity object for a fully valid row', () => {
      const result = service.validate(validRow(), 1);
      expect(result).not.toBeNull();
      expect(result?.event_id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result?.merchant_id).toBe('MRC-123456');
      expect(result?.product).toBe('POS');
      expect(result?.status).toBe('SUCCESS');
      expect(result?.amount).toBe(1500);
    });
  });

  describe('missing required fields', () => {
    it('returns null when event_id is missing', () => {
      expect(service.validate({ ...validRow(), event_id: '' }, 1)).toBeNull();
    });

    it('returns null when merchant_id is missing', () => {
      expect(service.validate({ ...validRow(), merchant_id: '' }, 1)).toBeNull();
    });

    it('returns null when product is missing', () => {
      expect(service.validate({ ...validRow(), product: '' }, 1)).toBeNull();
    });

    it('returns null when status is missing', () => {
      expect(service.validate({ ...validRow(), status: '' }, 1)).toBeNull();
    });

    it('returns null when event_type is missing', () => {
      expect(service.validate({ ...validRow(), event_type: '' }, 1)).toBeNull();
    });
  });

  describe('UUID validation', () => {
    it('returns null for a non-UUID event_id', () => {
      expect(service.validate({ ...validRow(), event_id: 'not-a-uuid' }, 1)).toBeNull();
    });

    it('accepts any valid UUID format', () => {
      const result = service.validate(
        { ...validRow(), event_id: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE' },
        1,
      );
      expect(result).not.toBeNull();
    });
  });

  describe('product validation', () => {
    it('returns null for an unknown product', () => {
      expect(service.validate({ ...validRow(), product: 'UNKNOWN' }, 1)).toBeNull();
    });

    it.each(['POS', 'AIRTIME', 'BILLS', 'CARD_PAYMENT', 'SAVINGS', 'MONIEBOOK', 'KYC'])(
      'accepts valid product: %s',
      (product) => {
        expect(service.validate({ ...validRow(), product }, 1)).not.toBeNull();
      },
    );
  });

  describe('status validation', () => {
    it('returns null for an unknown status', () => {
      expect(service.validate({ ...validRow(), status: 'CANCELLED' }, 1)).toBeNull();
    });

    it.each(['SUCCESS', 'FAILED', 'PENDING'])('accepts valid status: %s', (status) => {
      expect(service.validate({ ...validRow(), status }, 1)).not.toBeNull();
    });
  });

  describe('amount handling', () => {
    it('clamps negative amounts to 0', () => {
      const result = service.validate({ ...validRow(), amount: '-500' }, 1);
      expect(result?.amount).toBe(0);
    });

    it('defaults NaN amount to 0', () => {
      const result = service.validate({ ...validRow(), amount: 'abc' }, 1);
      expect(result?.amount).toBe(0);
    });

    it('defaults missing amount to 0', () => {
      const result = service.validate({ ...validRow(), amount: '' }, 1);
      expect(result?.amount).toBe(0);
    });

    it('strips locale commas from amounts like "1,250.00"', () => {
      const result = service.validate({ ...validRow(), amount: '1,250.00' }, 1);
      expect(result?.amount).toBe(1250);
    });

    it('parses a valid decimal amount', () => {
      const result = service.validate({ ...validRow(), amount: '9999.99' }, 1);
      expect(result?.amount).toBe(9999.99);
    });
  });

  describe('timestamp handling', () => {
    it('stores null for a missing timestamp', () => {
      const result = service.validate({ ...validRow(), event_timestamp: '' }, 1);
      expect(result).not.toBeNull();
      expect(result?.event_timestamp).toBeNull();
    });

    it('stores null for an unparseable timestamp', () => {
      const result = service.validate({ ...validRow(), event_timestamp: 'not-a-date' }, 1);
      expect(result?.event_timestamp).toBeNull();
    });

    it('parses a valid ISO timestamp', () => {
      const result = service.validate(validRow(), 1);
      expect(result?.event_timestamp).toBeInstanceOf(Date);
    });
  });

  describe('optional field handling', () => {
    it('stores null for an unknown channel', () => {
      const result = service.validate({ ...validRow(), channel: 'SATELLITE' }, 1);
      expect(result?.channel).toBeNull();
    });

    it('stores null for an unknown merchant_tier', () => {
      const result = service.validate({ ...validRow(), merchant_tier: 'ELITE' }, 1);
      expect(result?.merchant_tier).toBeNull();
    });

    it('stores null when channel is absent', () => {
      const result = service.validate({ ...validRow(), channel: '' }, 1);
      expect(result?.channel).toBeNull();
    });
  });

  describe('BOM and column normalisation', () => {
    it('handles BOM in column name', () => {
      const row = { ...validRow() } as Record<string, string>;
      row['\uFEFFevent_id'] = row['event_id'];
      delete row['event_id'];
      const result = service.validate(row, 1);
      expect(result).not.toBeNull();
    });

    it('handles uppercase column names', () => {
      const row: Record<string, string> = {
        EVENT_ID: validRow().event_id,
        MERCHANT_ID: validRow().merchant_id,
        EVENT_TIMESTAMP: validRow().event_timestamp,
        PRODUCT: validRow().product,
        EVENT_TYPE: validRow().event_type,
        AMOUNT: validRow().amount,
        STATUS: validRow().status,
        CHANNEL: validRow().channel,
        REGION: validRow().region,
        MERCHANT_TIER: validRow().merchant_tier,
      };
      const result = service.validate(row, 1);
      expect(result).not.toBeNull();
    });
  });

  describe('stats tracking', () => {
    it('increments total on each call', () => {
      service.validate(validRow(), 1);
      service.validate(validRow(), 2);
      expect(service.getStats().total).toBe(2);
    });

    it('increments invalidUUID when UUID is bad', () => {
      service.validate({ ...validRow(), event_id: 'bad' }, 1);
      expect(service.getStats().invalidUUID).toBe(1);
    });

    it('increments invalidProduct when product is unknown', () => {
      service.validate({ ...validRow(), product: 'GARBAGE' }, 1);
      expect(service.getStats().invalidProduct).toBe(1);
    });

    it('increments negativeAmount when amount is negative', () => {
      service.validate({ ...validRow(), amount: '-1' }, 1);
      expect(service.getStats().negativeAmount).toBe(1);
    });
  });
});
