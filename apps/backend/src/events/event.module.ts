import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { EventController } from './event.controller.js';
import { EventRepository } from './event.repository.js';
import { EventService } from './event.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [EventController],
  providers: [EventRepository, EventService],
})
export class EventModule {}
