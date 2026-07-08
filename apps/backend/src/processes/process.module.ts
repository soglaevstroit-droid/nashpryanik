import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { EventModule } from '../events/event.module.js';
import { ProcessController } from './process.controller.js';
import { ProcessRepository } from './process.repository.js';
import { ProcessService } from './process.service.js';

@Module({
  imports: [DatabaseModule, EventModule],
  controllers: [ProcessController],
  providers: [ProcessRepository, ProcessService],
})
export class ProcessModule {}
