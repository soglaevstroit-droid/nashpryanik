import { Controller, Get } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { HealthResponse } from './health-response.js';

@Controller('health')
export class HealthController {
  constructor(private readonly config: AppConfigService) {}

  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      appName: this.config.appName,
      environment: this.config.environment,
      timestamp: new Date().toISOString(),
    };
  }
}
