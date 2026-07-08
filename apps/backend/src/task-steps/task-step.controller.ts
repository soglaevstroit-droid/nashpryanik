import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CreateTaskStepDto } from './dto/create-task-step.dto.js';
import { TaskStepRecord } from './task-step-record.js';
import { TaskStepService } from './task-step.service.js';

const manageStepRoles = ['CREATOR', 'DIRECTOR', 'FOREMAN'] as const;
const readStepRoles = ['CREATOR', 'DIRECTOR', 'FOREMAN', 'FINANCE', 'WORKER'] as const;
const workerStepRoles = ['CREATOR', 'DIRECTOR', 'FOREMAN', 'WORKER'] as const;

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaskStepController {
  constructor(private readonly steps: TaskStepService) {}

  @Post('api/v1/tasks/:taskId/steps')
  @Roles(...manageStepRoles)
  createStep(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskStepDto,
  ): Promise<TaskStepRecord> {
    return this.steps.createStep(user, taskId, dto);
  }

  @Get('api/v1/tasks/:taskId/steps')
  @Roles(...readStepRoles)
  listStepsByTask(@Param('taskId') taskId: string): Promise<TaskStepRecord[]> {
    return this.steps.listStepsByTask(taskId);
  }

  @Get('api/v1/task-steps/:id')
  @Roles(...readStepRoles)
  getStep(@Param('id') id: string): Promise<TaskStepRecord> {
    return this.steps.getStep(id);
  }

  @Patch('api/v1/task-steps/:id/start')
  @Roles(...workerStepRoles)
  startStep(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TaskStepRecord> {
    return this.steps.startStep(user, id);
  }

  @Patch('api/v1/task-steps/:id/complete')
  @Roles(...workerStepRoles)
  completeStep(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TaskStepRecord> {
    return this.steps.completeStep(user, id);
  }

  @Patch('api/v1/task-steps/:id/reopen')
  @Roles(...manageStepRoles)
  reopenStep(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TaskStepRecord> {
    return this.steps.reopenStep(user, id);
  }

  @Patch('api/v1/task-steps/:id/cancel')
  @Roles(...manageStepRoles)
  cancelStep(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TaskStepRecord> {
    return this.steps.cancelStep(user, id);
  }
}
