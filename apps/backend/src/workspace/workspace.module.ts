import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { EventModule } from '../events/event.module.js';
import { TaskStepModule } from '../task-steps/task-step.module.js';
import { TaskModule } from '../tasks/task.module.js';
import { WorkShiftModule } from '../work-shifts/work-shift.module.js';
import { WorkspaceController } from './workspace.controller.js';
import { WorkspaceService } from './workspace.service.js';

@Module({
  imports: [AuthModule, WorkShiftModule, TaskModule, TaskStepModule, EventModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, JwtAuthGuard, RolesGuard],
})
export class WorkspaceModule {}
