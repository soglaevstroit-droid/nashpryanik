import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventModule } from '../events/event.module.js';
import { ProcessModule } from '../processes/process.module.js';
import { TaskController } from './task.controller.js';
import { TaskRepository } from './task.repository.js';
import { TaskService } from './task.service.js';

@Module({
  imports: [AppConfigModule, DatabaseModule, EventModule, ProcessModule],
  controllers: [TaskController],
  providers: [TaskRepository, TaskService, JwtService, JwtAuthGuard, RolesGuard],
})
export class TaskModule {}
