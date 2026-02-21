import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IngestionService } from '../ingestion/ingestion.service';
import { AnalyticsService } from '../analytics/analytics.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Service health — import status and analytics readiness' })
  @ApiResponse({ status: 200, description: 'Returns current service state' })
  getHealth() {
    return {
      status: 'ok',
      import: {
        complete: this.ingestionService.isComplete,
        totalImported: this.ingestionService.totalImported,
        totalSkipped: this.ingestionService.totalSkipped,
      },
      analytics: {
        ready: this.analyticsService.isReady,
      },
    };
  }
}
