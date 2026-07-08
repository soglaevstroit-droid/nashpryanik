import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { WorkerWorkspaceRecord } from './workspace-record.js';
import { WorkspaceService } from './workspace.service.js';

@Controller('api/v1/workspace')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get()
  @Roles('WORKER')
  getWorkspace(@CurrentUser() user: AuthUser): Promise<WorkerWorkspaceRecord> {
    return this.workspace.getWorkerWorkspace(user);
  }
}
