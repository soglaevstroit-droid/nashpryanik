import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventModule } from '../events/event.module.js';
import { ActiveShiftAccessModule } from '../work-shifts/active-shift-access.module.js';
import { TaskMessageController } from './task-message.controller.js';
import { TaskMessageService } from './task-message.service.js';

@Module({
  imports: [ActiveShiftAccessModule, AppConfigModule, DatabaseModule, EventModule],
  controllers: [TaskMessageController],
  providers: [TaskMessageService, JwtService, JwtAuthGuard, RolesGuard],
})
export class TaskMessageModule {}
