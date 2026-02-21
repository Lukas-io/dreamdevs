import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * Blocks analytics endpoints with HTTP 503 if pre-computation
 * has not yet completed. This prevents returning empty or stale
 * data during the startup import window.
 */
@Injectable()
export class AnalyticsReadyGuard implements CanActivate {
  constructor(private readonly analyticsService: AnalyticsService) {}

  canActivate(): boolean {
    if (!this.analyticsService.isReady) {
      throw new ServiceUnavailableException(
        'Analytics are being computed. Please try again in a few moments.',
      );
    }
    return true;
  }
}
