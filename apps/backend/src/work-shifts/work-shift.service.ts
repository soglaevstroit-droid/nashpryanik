import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { EventService } from '../events/event.service.js';
import { ProcessService } from '../processes/process.service.js';
import { WorkShiftRecord } from './work-shift-record.js';
import { WorkShiftRepository } from './work-shift.repository.js';

const defaultHistoryLimit = 100;

@Injectable()
export class WorkShiftService {
  constructor(
    private readonly repository: WorkShiftRepository,
    private readonly events: EventService,
    private readonly processes: ProcessService,
  ) {}

  async startShift(user: AuthUser): Promise<WorkShiftRecord> {
    assertAuthUser(user);

    const active = await this.repository.findActiveByUserId(user.id);

    if (active) {
      throw new BadRequestException('Active work shift already exists');
    }

    const process = await this.processes.createProcess({
      type: 'WORK_SHIFT',
      title: 'Work shift',
      description: 'Employee work shift lifecycle',
    });
    const activeProcess = await this.processes.startProcess(process.id);
    const shift = await this.repository.create({
      userId: user.id,
      processId: activeProcess.id,
      startedAt: new Date(),
    });
    await this.events.createEvent({
      type: 'WORK_SHIFT_STARTED',
      actorId: user.id,
      entityType: 'work_shift',
      entityId: shift.id,
      payload: {
        status: shift.status,
        processId: shift.processId,
      },
      metadata: {
        source: 'work-shift-foundation',
      },
    });

    return shift;
  }

  async finishShift(user: AuthUser): Promise<WorkShiftRecord> {
    assertAuthUser(user);

    const active = await this.repository.findActiveByUserId(user.id);

    if (!active) {
      throw new BadRequestException('Active work shift not found');
    }

    const shift = await this.repository.finish(active.id, new Date());

    if (shift.processId) {
      await this.processes.completeProcess(shift.processId);
    }

    await this.events.createEvent({
      type: 'WORK_SHIFT_FINISHED',
      actorId: user.id,
      entityType: 'work_shift',
      entityId: shift.id,
      payload: {
        status: shift.status,
        processId: shift.processId,
      },
      metadata: {
        source: 'work-shift-foundation',
      },
    });

    return shift;
  }

  getCurrentShift(user: AuthUser): Promise<WorkShiftRecord | null> {
    assertAuthUser(user);

    return this.repository.findActiveByUserId(user.id);
  }

  history(user: AuthUser): Promise<WorkShiftRecord[]> {
    assertAuthUser(user);

    return this.repository.findManyByUserId(user.id, defaultHistoryLimit);
  }
}

function assertAuthUser(user: AuthUser): void {
  if (!user?.id) {
    throw new BadRequestException('Authenticated user is required');
  }
}
