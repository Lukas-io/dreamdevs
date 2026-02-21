import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller()
export class AppController {
  @Get()
  @ApiExcludeEndpoint()
  index() {
    return {
      name: 'Merchant Intelligence API',
      description:
        'Analytics API processing merchant activity logs across Moniepoint product ecosystem.',
      author: 'Iyamu Wisdom',
      version: '1.0.0',
      docs: '/docs',
      health: '/health',
      endpoints: {
        top_merchant: 'GET /analytics/top-merchant',
        monthly_active_merchants: 'GET /analytics/monthly-active-merchants',
        product_adoption: 'GET /analytics/product-adoption',
        kyc_funnel: 'GET /analytics/kyc-funnel',
        failure_rates: 'GET /analytics/failure-rates',
      },
    };
  }
}
