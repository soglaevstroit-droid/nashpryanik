import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module.js';
import { ArtifactModule } from '../artifacts/artifact.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventModule } from '../events/event.module.js';
import { ProcessModule } from '../processes/process.module.js';
import { WorkShiftController } from './work-shift.controller.js';
import { WorkShiftPhotoRepository } from './work-shift-photo.repository.js';
import { WorkShiftRepository } from './work-shift.repository.js';
import { WorkShiftService } from './work-shift.service.js';

@Module({
  imports: [AppConfigModule, ArtifactModule, DatabaseModule, EventModule, ProcessModule],
  controllers: [WorkShiftController],
  providers: [WorkShiftPhotoRepository, WorkShiftRepository, WorkShiftService, JwtService, JwtAuthGuard, RolesGuard],
  exports: [WorkShiftService],
})
export class WorkShiftModule {}
