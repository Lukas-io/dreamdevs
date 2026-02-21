import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsReadyGuard } from './analytics-ready.guard';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(AnalyticsReadyGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('top-merchant')
  @ApiOperation({
    summary: 'Top Merchant',
    description:
      'Returns the single merchant with the highest cumulative transaction volume across all products. ' +
      'Only `SUCCESS` status events contribute to the total. Amounts are summed in NGN and rounded to 2 decimal places.',
  })
  @ApiResponse({
    status: 200,
    description: '`merchant_id` — the merchant identifier. `total_volume` — total NGN amount in 2dp.',
    content: {
      'application/json': {
        example: {
          merchant_id: 'MRC-009405',
          total_volume: 181479333.57,
        },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Data is still being imported. Retry in a few moments.' })
  getTopMerchant() {
    return this.analyticsService.getTopMerchant();
  }

  @Get('monthly-active-merchants')
  @ApiOperation({
    summary: 'Monthly Active Merchants',
    description:
      'Returns the count of unique merchants who had at least one `SUCCESS` event per calendar month. ' +
      'Merchants with no successful events in a given month are excluded. ' +
      'Results are keyed by `YYYY-MM` and ordered chronologically.',
  })
  @ApiResponse({
    status: 200,
    description: 'Object keyed by `YYYY-MM` with the count of unique active merchants as the value.',
    content: {
      'application/json': {
        example: {
          '2024-01': 9847,
          '2024-02': 9901,
          '2024-03': 10012,
          '2024-12': 10234,
        },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Data is still being imported. Retry in a few moments.' })
  getMonthlyActiveMerchants() {
    return this.analyticsService.getMonthlyActiveMerchants();
  }

  @Get('product-adoption')
  @ApiOperation({
    summary: 'Product Adoption',
    description:
      'Returns the number of unique merchants who interacted with each product, regardless of transaction status. ' +
      'Products: `POS`, `AIRTIME`, `BILLS`, `CARD_PAYMENT`, `SAVINGS`, `MONIEBOOK`, `KYC`. ' +
      'Sorted by adoption count, highest first.',
  })
  @ApiResponse({
    status: 200,
    description: 'Object keyed by product name with unique merchant count as the value, sorted descending.',
    content: {
      'application/json': {
        example: {
          BILLS: 4379,
          SAVINGS: 4368,
          POS: 4348,
          AIRTIME: 4277,
          MONIEBOOK: 4267,
          CARD_PAYMENT: 4233,
          KYC: 4167,
        },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Data is still being imported. Retry in a few moments.' })
  getProductAdoption() {
    return this.analyticsService.getProductAdoption();
  }

  @Get('kyc-funnel')
  @ApiOperation({
    summary: 'KYC Funnel',
    description:
      'Returns the KYC conversion funnel showing unique merchant counts at each verification stage. ' +
      'Only `SUCCESS` events are counted. Stages in order: document submission → verification → tier upgrade. ' +
      'Drop-off between stages indicates friction in the KYC process.',
  })
  @ApiResponse({
    status: 200,
    description:
      '`documents_submitted` — merchants who submitted KYC docs. ' +
      '`verifications_completed` — merchants whose verification succeeded. ' +
      '`tier_upgrades` — merchants who completed a tier upgrade.',
    content: {
      'application/json': {
        example: {
          documents_submitted: 3760,
          verifications_completed: 3389,
          tier_upgrades: 2496,
        },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Data is still being imported. Retry in a few moments.' })
  getKycFunnel() {
    return this.analyticsService.getKycFunnel();
  }

  @Get('failure-rates')
  @ApiOperation({
    summary: 'Failure Rates by Product',
    description:
      'Returns the transaction failure rate for each product, calculated as `FAILED / (SUCCESS + FAILED) × 100`. ' +
      '`PENDING` events are excluded from both numerator and denominator. ' +
      'Results are sorted by failure rate descending — highest failure rate first.',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of `{ product, failure_rate }` objects. `failure_rate` is a percentage rounded to 1dp.',
    content: {
      'application/json': {
        example: [
          { product: 'BILLS', failure_rate: 5.3 },
          { product: 'CARD_PAYMENT', failure_rate: 5.2 },
          { product: 'AIRTIME', failure_rate: 5.2 },
          { product: 'MONIEBOOK', failure_rate: 5.2 },
          { product: 'POS', failure_rate: 5.2 },
          { product: 'SAVINGS', failure_rate: 5.2 },
          { product: 'KYC', failure_rate: 5.2 },
        ],
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Data is still being imported. Retry in a few moments.' })
  getFailureRates() {
    return this.analyticsService.getFailureRates();
  }
}
