import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { EventRecord } from './event-record.js';
import { EventService } from './event.service.js';

@Controller('api/v1/events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventController {
  constructor(private readonly events: EventService) {}

  @Post()
  @Roles('CREATOR', 'DIRECTOR', 'FOREMAN')
  createEvent(@Body() body: CreateEventDto): Promise<EventRecord> {
    return this.events.createEvent(body);
  }

  @Get()
  @Roles('CREATOR', 'DIRECTOR', 'FOREMAN', 'FINANCE')
  listEvents(): Promise<EventRecord[]> {
    return this.events.listEvents();
  }

  @Get(':id')
  @Roles('CREATOR', 'DIRECTOR', 'FOREMAN', 'FINANCE')
  getEventById(@Param('id') id: string): Promise<EventRecord> {
    return this.events.getEventById(id);
  }
}
