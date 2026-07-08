import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventModule } from '../events/event.module.js';
import { TaskModule } from '../tasks/task.module.js';
import { TaskStepController } from './task-step.controller.js';
import { TaskStepRepository } from './task-step.repository.js';
import { TaskStepService } from './task-step.service.js';

@Module({
  imports: [AppConfigModule, DatabaseModule, EventModule, TaskModule],
  controllers: [TaskStepController],
  providers: [TaskStepRepository, TaskStepService, JwtService, JwtAuthGuard, RolesGuard],
})
export class TaskStepModule {}
