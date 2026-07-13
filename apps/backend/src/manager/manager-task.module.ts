import { Module } from '@nestjs/common';
import { ArtifactModule } from '../artifacts/artifact.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventModule } from '../events/event.module.js';
import { ManagerTaskController } from './manager-task.controller.js';
import { ManagerTaskService } from './manager-task.service.js';

@Module({
  imports: [AppConfigModule, DatabaseModule, EventModule, ArtifactModule],
  controllers: [ManagerTaskController],
  providers: [ManagerTaskService, JwtService, JwtAuthGuard, RolesGuard],
})
export class ManagerTaskModule {}
