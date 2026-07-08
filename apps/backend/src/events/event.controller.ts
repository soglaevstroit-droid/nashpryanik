import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto.js';
import { EventRecord } from './event-record.js';
import { EventService } from './event.service.js';

@Controller('api/v1/events')
export class EventController {
  constructor(private readonly events: EventService) {}

  @Post()
  createEvent(@Body() body: CreateEventDto): Promise<EventRecord> {
    return this.events.createEvent(body);
  }

  @Get()
  listEvents(): Promise<EventRecord[]> {
    return this.events.listEvents();
  }

  @Get(':id')
  getEventById(@Param('id') id: string): Promise<EventRecord> {
    return this.events.getEventById(id);
  }
}
