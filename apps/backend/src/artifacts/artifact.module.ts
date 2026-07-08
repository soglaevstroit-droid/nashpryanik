import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventModule } from '../events/event.module.js';
import { ArtifactController } from './artifact.controller.js';
import { ArtifactRepository } from './artifact.repository.js';
import { ArtifactStorageService } from './artifact-storage.service.js';
import { ArtifactService } from './artifact.service.js';

@Module({
  imports: [AppConfigModule, DatabaseModule, EventModule],
  controllers: [ArtifactController],
  providers: [
    ArtifactRepository,
    ArtifactStorageService,
    ArtifactService,
    JwtService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class ArtifactModule {}
