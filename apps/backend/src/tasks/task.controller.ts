import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { TaskRecord } from './task-record.js';
import { TaskService } from './task.service.js';

const manageTaskRoles = ['CREATOR', 'DIRECTOR', 'FOREMAN'] as const;
const readTaskRoles = ['CREATOR', 'DIRECTOR', 'FOREMAN', 'FINANCE', 'WORKER'] as const;
const workerTaskRoles = ['CREATOR', 'DIRECTOR', 'FOREMAN', 'WORKER'] as const;

@Controller('api/v1/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @Post()
  @Roles(...manageTaskRoles)
  createTask(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto): Promise<TaskRecord> {
    return this.tasks.createTask(user, dto);
  }

  @Get()
  @Roles('CREATOR', 'DIRECTOR', 'FOREMAN', 'FINANCE')
  listTasks(): Promise<TaskRecord[]> {
    return this.tasks.listTasks();
  }

  @Get('my')
  @Roles('WORKER')
  listMyTasks(@CurrentUser() user: AuthUser): Promise<TaskRecord[]> {
    return this.tasks.listMyTasks(user);
  }

  @Get(':id')
  @Roles(...readTaskRoles)
  getTask(@Param('id') id: string): Promise<TaskRecord> {
    return this.tasks.getTask(id);
  }

  @Patch(':id/assign')
  @Roles(...manageTaskRoles)
  assignTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignTaskDto,
  ): Promise<TaskRecord> {
    return this.tasks.assignTask(user, id, dto);
  }

  @Patch(':id/accept')
  @Roles(...workerTaskRoles)
  acceptTask(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TaskRecord> {
    return this.tasks.acceptTask(user, id);
  }

  @Patch(':id/start')
  @Roles(...workerTaskRoles)
  startTask(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TaskRecord> {
    return this.tasks.startTask(user, id);
  }

  @Patch(':id/review')
  @Roles(...workerTaskRoles)
  sendToReview(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TaskRecord> {
    return this.tasks.sendToReview(user, id);
  }

  @Patch(':id/complete')
  @Roles(...workerTaskRoles)
  completeTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('operationId') operationId?: string,
  ): Promise<TaskRecord> {
    return this.tasks.completeTask(user, id, operationId);
  }

  @Patch(':id/cancel')
  @Roles(...manageTaskRoles)
  cancelTask(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TaskRecord> {
    return this.tasks.cancelTask(user, id);
  }
}
