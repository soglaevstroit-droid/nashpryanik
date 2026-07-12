import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ActiveShiftAccessModule } from '../work-shifts/active-shift-access.module.js';
import { WorkerController } from './worker.controller.js';
import { WorkerService } from './worker.service.js';

@Module({
  imports: [ActiveShiftAccessModule, AppConfigModule, DatabaseModule],
  controllers: [WorkerController],
  providers: [WorkerService, JwtService, JwtAuthGuard, RolesGuard],
})
export class WorkerModule {}
