import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventModule } from '../events/event.module.js';
import { ProcessModule } from '../processes/process.module.js';
import { WorkShiftController } from './work-shift.controller.js';
import { WorkShiftRepository } from './work-shift.repository.js';
import { WorkShiftService } from './work-shift.service.js';

@Module({
  imports: [AppConfigModule, DatabaseModule, EventModule, ProcessModule],
  controllers: [WorkShiftController],
  providers: [WorkShiftRepository, WorkShiftService, JwtService, JwtAuthGuard],
  exports: [WorkShiftService],
})
export class WorkShiftModule {}
