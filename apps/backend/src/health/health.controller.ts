import { Controller, Get } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { HealthResponse, ReadinessResponse } from './health-response.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService,
  ) {}

  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      appName: this.config.appName,
      environment: this.config.environment,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async getReadiness(): Promise<ReadinessResponse> {
    return {
      ...this.getHealth(),
      database: {
        connected: await this.database.checkConnection(),
      },
    };
  }
}
