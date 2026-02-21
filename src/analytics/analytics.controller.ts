import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('top-merchant')
  @ApiOperation({ summary: 'Merchant with highest total successful transaction volume' })
  @ApiResponse({ status: 200, description: 'Returns merchant_id and total_volume' })
  getTopMerchant() {
    return this.analyticsService.getTopMerchant();
  }

  @Get('monthly-active-merchants')
  @ApiOperation({ summary: 'Unique merchants with at least one successful event per month' })
  @ApiResponse({ status: 200, description: 'Returns a map of YYYY-MM to merchant count' })
  getMonthlyActiveMerchants() {
    return this.analyticsService.getMonthlyActiveMerchants();
  }

  @Get('product-adoption')
  @ApiOperation({ summary: 'Unique merchant count per product, sorted by count descending' })
  @ApiResponse({ status: 200, description: 'Returns a map of product to unique merchant count' })
  getProductAdoption() {
    return this.analyticsService.getProductAdoption();
  }

  @Get('kyc-funnel')
  @ApiOperation({ summary: 'KYC conversion funnel — unique merchants at each stage (SUCCESS only)' })
  @ApiResponse({ status: 200, description: 'Returns documents_submitted, verifications_completed, tier_upgrades' })
  getKycFunnel() {
    return this.analyticsService.getKycFunnel();
  }

  @Get('failure-rates')
  @ApiOperation({ summary: 'Failure rate per product, sorted descending. Excludes PENDING.' })
  @ApiResponse({ status: 200, description: 'Returns array of { product, failure_rate }' })
  getFailureRates() {
    return this.analyticsService.getFailureRates();
  }
}
