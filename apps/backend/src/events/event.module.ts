import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtService } from '../auth/jwt.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventController } from './event.controller.js';
import { EventRepository } from './event.repository.js';
import { EventService } from './event.service.js';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [EventController],
  providers: [EventRepository, EventService, JwtService, JwtAuthGuard, RolesGuard],
  exports: [EventService],
})
export class EventModule {}
