import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventModule } from '../events/event.module.js';
import { ActiveShiftAccessModule } from '../work-shifts/active-shift-access.module.js';
import { ArtifactController } from './artifact.controller.js';
import { ArtifactRepository } from './artifact.repository.js';
import { ArtifactStorageService } from './artifact-storage.service.js';
import { ArtifactService } from './artifact.service.js';
import { PhotoPreviewService } from './photo-preview.service.js';

@Module({
  imports: [ActiveShiftAccessModule, AppConfigModule, DatabaseModule, EventModule],
  controllers: [ArtifactController],
  providers: [
    ArtifactRepository,
    ArtifactStorageService,
    PhotoPreviewService,
    ArtifactService,
    JwtService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [ArtifactService],
})
export class ArtifactModule {}
