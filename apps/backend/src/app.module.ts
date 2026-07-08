import { Module } from '@nestjs/common';
import { ArtifactModule } from './artifacts/artifact.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { EventModule } from './events/event.module.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from './logger/logger.module.js';
import { ProcessModule } from './processes/process.module.js';
import { RolesModule } from './roles/roles.module.js';
import { TaskStepModule } from './task-steps/task-step.module.js';
import { TaskModule } from './tasks/task.module.js';
import { UserModule } from './users/user.module.js';
import { WorkspaceModule } from './workspace/workspace.module.js';
import { WorkShiftModule } from './work-shifts/work-shift.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    CommonModule,
    DatabaseModule,
    HealthModule,
    EventModule,
    ProcessModule,
    UserModule,
    RolesModule,
    AuthModule,
    WorkShiftModule,
    TaskModule,
    TaskStepModule,
    ArtifactModule,
    WorkspaceModule,
  ],
})
export class AppModule {}
