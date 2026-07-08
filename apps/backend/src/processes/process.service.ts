import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProcessStatus } from '@prisma/client';
import { EventService } from '../events/event.service.js';
import { EventType } from '../events/event-types.js';
import { CreateProcessDto } from './dto/create-process.dto.js';
import { ProcessRecord } from './process-record.js';
import { ProcessRepository } from './process.repository.js';

const defaultProcessListLimit = 100;

@Injectable()
export class ProcessService {
  constructor(
    private readonly repository: ProcessRepository,
    private readonly events: EventService,
  ) {}

  async createProcess(dto: CreateProcessDto): Promise<ProcessRecord> {
    this.assertCreateProcessDto(dto);

    const process = await this.repository.create(dto);
    await this.createProcessEvent(process, 'PROCESS_CREATED');

    return process;
  }

  async startProcess(id: string): Promise<ProcessRecord> {
    const process = await this.getProcess(id);
    this.assertTransition(process, ['CREATED', 'PAUSED'], 'start');

    const startedAt = process.startedAt ?? new Date();
    const updated = await this.repository.updateStatus(id, 'ACTIVE', {
      startedAt,
      finishedAt: undefined,
    });
    await this.createProcessEvent(
      updated,
      process.status === 'PAUSED' ? 'PROCESS_RESUMED' : 'PROCESS_STARTED',
    );

    return updated;
  }

  async pauseProcess(id: string): Promise<ProcessRecord> {
    const process = await this.getProcess(id);
    this.assertTransition(process, ['ACTIVE'], 'pause');

    const updated = await this.repository.updateStatus(id, 'PAUSED');
    await this.createProcessEvent(updated, 'PROCESS_PAUSED');

    return updated;
  }

  async completeProcess(id: string): Promise<ProcessRecord> {
    const process = await this.getProcess(id);
    this.assertTransition(process, ['ACTIVE', 'PAUSED'], 'complete');

    const updated = await this.repository.updateStatus(id, 'COMPLETED', {
      finishedAt: new Date(),
    });
    await this.createProcessEvent(updated, 'PROCESS_COMPLETED');

    return updated;
  }

  async cancelProcess(id: string): Promise<ProcessRecord> {
    const process = await this.getProcess(id);
    this.assertTransition(process, ['CREATED', 'ACTIVE', 'PAUSED'], 'cancel');

    const updated = await this.repository.updateStatus(id, 'CANCELLED', {
      finishedAt: new Date(),
    });
    await this.createProcessEvent(updated, 'PROCESS_CANCELLED');

    return updated;
  }

  async getProcess(id: string): Promise<ProcessRecord> {
    if (!id) {
      throw new BadRequestException('Process id is required');
    }

    const process = await this.repository.findById(id);

    if (!process) {
      throw new NotFoundException('Process not found');
    }

    return process;
  }

  async listProcesses(): Promise<ProcessRecord[]> {
    return this.repository.findMany(defaultProcessListLimit);
  }

  private assertCreateProcessDto(dto: CreateProcessDto): void {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Process body is required');
    }

    assertRequiredString(dto.type, 'type');
    assertRequiredString(dto.title, 'title');

    if (
      dto.description !== undefined &&
      dto.description !== null &&
      typeof dto.description !== 'string'
    ) {
      throw new BadRequestException('Process description must be a string or null');
    }
  }

  private assertTransition(process: ProcessRecord, allowed: ProcessStatus[], action: string): void {
    if (!allowed.includes(process.status)) {
      throw new BadRequestException(`Process cannot ${action} from status ${process.status}`);
    }
  }

  private async createProcessEvent(process: ProcessRecord, type: EventType): Promise<void> {
    await this.events.createEvent({
      type,
      entityType: 'process',
      entityId: process.id,
      payload: {
        processType: process.type,
        processStatus: process.status,
      },
      metadata: {
        source: 'process-engine',
      },
    });
  }
}

function assertRequiredString(value: unknown, fieldName: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`Process ${fieldName} is required`);
  }
}
