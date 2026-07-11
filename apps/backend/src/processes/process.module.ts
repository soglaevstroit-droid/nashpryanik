import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventModule } from '../events/event.module.js';
import { ProcessController } from './process.controller.js';
import { ProcessRepository } from './process.repository.js';
import { ProcessService } from './process.service.js';

@Module({
  imports: [AppConfigModule, DatabaseModule, EventModule],
  controllers: [ProcessController],
  providers: [ProcessRepository, ProcessService, JwtService, JwtAuthGuard, RolesGuard],
  exports: [ProcessRepository, ProcessService],
})
export class ProcessModule {}
