import { Injectable } from '@nestjs/common';
import { WorkShift, WorkShiftStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service.js';
import { WorkShiftRecord } from './work-shift-record.js';

@Injectable()
export class WorkShiftRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(data: {
    userId: string;
    processId: string;
    startedAt: Date;
  }): Promise<WorkShiftRecord> {
    const shift = await this.database.workShift.create({
      data: {
        userId: data.userId,
        processId: data.processId,
        status: 'ACTIVE',
        startedAt: data.startedAt,
      },
    });

    return this.toRecord(shift);
  }

  async findActiveByUserId(userId: string): Promise<WorkShiftRecord | null> {
    const shift = await this.database.workShift.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    return shift ? this.toRecord(shift) : null;
  }

  async findById(id: string): Promise<WorkShiftRecord | null> {
    const shift = await this.database.workShift.findUnique({
      where: {
        id,
      },
    });

    return shift ? this.toRecord(shift) : null;
  }

  async finish(id: string, finishedAt: Date): Promise<WorkShiftRecord> {
    const shift = await this.database.workShift.update({
      where: {
        id,
      },
      data: {
        status: 'FINISHED',
        finishedAt,
      },
    });

    return this.toRecord(shift);
  }

  async findManyByUserId(userId: string, limit: number): Promise<WorkShiftRecord[]> {
    const shifts = await this.database.workShift.findMany({
      where: {
        userId,
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: limit,
    });

    return shifts.map((shift) => this.toRecord(shift));
  }

  private toRecord(shift: WorkShift): WorkShiftRecord {
    return {
      id: shift.id,
      userId: shift.userId,
      processId: shift.processId,
      status: shift.status as WorkShiftStatus,
      startedAt: shift.startedAt,
      finishedAt: shift.finishedAt,
      createdAt: shift.createdAt,
      updatedAt: shift.updatedAt,
    };
  }
}
