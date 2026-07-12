import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { WorkerService } from './worker.service.js';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('WORKER')
export class WorkerController {
  constructor(private readonly workers: WorkerService) {}

  @Get('worker/objects')
  getObjects(@CurrentUser() user: AuthUser) {
    return this.workers.getObjectsWithTasks(user);
  }

  @Get('worker/tasks/:taskId')
  getTask(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string) {
    return this.workers.getTask(user, taskId);
  }

  @Get('history')
  getHistory(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.workers.getHistory(user, { limit, cursor });
  }
}
