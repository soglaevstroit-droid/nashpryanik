import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [HealthController],
})
export class HealthModule {}
