import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UploadedArtifactFile } from '../artifacts/uploaded-artifact-file.js';
import { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ManagerTaskInput, ManagerTaskService } from './manager-task.service.js';
import { TaskAccessStatus, TaskPriority } from '@prisma/client';

interface ManagerUpdateBody {
  operationId: string;
  priority?: TaskPriority;
  accessStatus?: TaskAccessStatus;
  position?: number;
}
interface ManagerDeleteBody {
  operationId: string;
  reason?: string;
}
interface ManagerHistoryQuery {
  workerId?: string;
  limit?: string;
  cursor?: string;
}

@Controller('api/v1/manager')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('FOREMAN', 'DIRECTOR', 'CREATOR')
export class ManagerTaskController {
  constructor(private readonly manager: ManagerTaskService) {}
  @Get('workers') workers() {
    return this.manager.listWorkers();
  }
  @Get('objects') objects() {
    return this.manager.listObjects();
  }
  @Get('tasks') tasks() {
    return this.manager.listTasks();
  }
  @Get('history') history(@Query() query: ManagerHistoryQuery) {
    return this.manager.getHistory(query);
  }
  @Get('tasks/:taskId') task(@Param('taskId') taskId: string) {
    return this.manager.getTask(taskId);
  }
  @Post('tasks')
  @UseInterceptors(FilesInterceptor('photos', 12))
  create(
    @CurrentUser() user: AuthUser,
    @Body('payload') payload: string,
    @UploadedFiles() files: UploadedArtifactFile[] = [],
  ) {
    return this.manager.createTask(user, JSON.parse(payload) as ManagerTaskInput, files);
  }
  @Patch('tasks/:taskId') update(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() body: ManagerUpdateBody,
  ) {
    return this.manager.updateTask(user, taskId, body);
  }
  @Delete('tasks/:taskId') remove(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() body: ManagerDeleteBody,
  ) {
    return this.manager.deleteTask(user, taskId, body);
  }
}
