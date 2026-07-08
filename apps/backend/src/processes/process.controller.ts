import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CreateProcessDto } from './dto/create-process.dto.js';
import { ProcessRecord } from './process-record.js';
import { ProcessService } from './process.service.js';

@Controller('api/v1/processes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CREATOR', 'DIRECTOR', 'FOREMAN')
export class ProcessController {
  constructor(private readonly processes: ProcessService) {}

  @Post()
  createProcess(@Body() body: CreateProcessDto): Promise<ProcessRecord> {
    return this.processes.createProcess(body);
  }

  @Get()
  listProcesses(): Promise<ProcessRecord[]> {
    return this.processes.listProcesses();
  }

  @Get(':id')
  getProcess(@Param('id') id: string): Promise<ProcessRecord> {
    return this.processes.getProcess(id);
  }

  @Patch(':id/start')
  startProcess(@Param('id') id: string): Promise<ProcessRecord> {
    return this.processes.startProcess(id);
  }

  @Patch(':id/pause')
  pauseProcess(@Param('id') id: string): Promise<ProcessRecord> {
    return this.processes.pauseProcess(id);
  }

  @Patch(':id/complete')
  completeProcess(@Param('id') id: string): Promise<ProcessRecord> {
    return this.processes.completeProcess(id);
  }

  @Patch(':id/cancel')
  cancelProcess(@Param('id') id: string): Promise<ProcessRecord> {
    return this.processes.cancelProcess(id);
  }
}
