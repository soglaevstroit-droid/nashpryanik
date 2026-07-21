import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AnalystController } from './analyst.controller.js';
import { AnalystService } from './analyst.service.js';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [AnalystController],
  providers: [AnalystService, JwtService, JwtAuthGuard, RolesGuard],
})
export class AnalystModule {}
