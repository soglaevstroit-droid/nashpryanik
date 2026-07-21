import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ManagerDecision } from '@prisma/client';
import { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { TaskMessageService } from './task-message.service.js';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaskMessageController {
  constructor(private readonly messages: TaskMessageService) {}

  @Post('worker/tasks/:taskId/pause')
  @Roles('WORKER')
  pause(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body('message') body: string,
  ) {
    return this.messages.pause(user, taskId, body);
  }

  @Post('worker/tasks/:taskId/resume')
  @Roles('WORKER')
  resume(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body('message') body: string,
  ) {
    return this.messages.resume(user, taskId, body);
  }

  @Post('worker/tasks/:taskId/help')
  @Roles('WORKER')
  help(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body('message') body: string,
  ) {
    return this.messages.help(user, taskId, body);
  }

  @Get('worker/messages')
  @Roles('WORKER')
  workerMessages(@CurrentUser() user: AuthUser) {
    return this.messages.workerMessages(user);
  }

  @Patch('worker/messages/:messageId/read')
  @Roles('WORKER')
  markRead(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string) {
    return this.messages.markRead(user, messageId);
  }

  @Get('manager/messages')
  @Roles('FOREMAN', 'DIRECTOR', 'CREATOR')
  managerMessages() {
    return this.messages.managerMessages();
  }

  @Post('manager/messages/:messageId/reply')
  @Roles('FOREMAN', 'DIRECTOR', 'CREATOR')
  reply(
    @CurrentUser() user: AuthUser,
    @Param('messageId') messageId: string,
    @Body('message') body: string,
    @Body('decision') decision: ManagerDecision,
  ) {
    return this.messages.reply(user, messageId, body, decision);
  }

  @Get('worker/archive')
  @Roles('WORKER')
  workerArchive(@CurrentUser() user: AuthUser) {
    return this.messages.archive(user);
  }

  @Get('manager/archive')
  @Roles('FOREMAN', 'DIRECTOR', 'CREATOR')
  managerArchive(@CurrentUser() user: AuthUser) {
    return this.messages.archive(user, true);
  }
}
