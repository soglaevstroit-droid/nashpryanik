import { Injectable } from '@nestjs/common';
import { Prisma, Process, ProcessStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service.js';
import { CreateProcessDto } from './dto/create-process.dto.js';
import { ProcessRecord } from './process-record.js';

@Injectable()
export class ProcessRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(
    data: CreateProcessDto,
    client: Prisma.TransactionClient = this.database,
  ): Promise<ProcessRecord> {
    const process = await client.process.create({
      data: {
        type: data.type,
        title: data.title,
        description: data.description ?? null,
      },
    });

    return this.toRecord(process);
  }

  async findById(
    id: string,
    client: Prisma.TransactionClient = this.database,
  ): Promise<ProcessRecord | null> {
    const process = await client.process.findUnique({
      where: {
        id,
      },
    });

    return process ? this.toRecord(process) : null;
  }

  async findMany(limit: number): Promise<ProcessRecord[]> {
    const processes = await this.database.process.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return processes.map((process) => this.toRecord(process));
  }

  async updateStatus(
    id: string,
    status: ProcessStatus,
    dates: {
      startedAt?: Date;
      finishedAt?: Date;
    } = {},
    client: Prisma.TransactionClient = this.database,
  ): Promise<ProcessRecord> {
    const process = await client.process.update({
      where: {
        id,
      },
      data: {
        status,
        ...dates,
      },
    });

    return this.toRecord(process);
  }

  private toRecord(process: Process): ProcessRecord {
    return {
      id: process.id,
      type: process.type,
      status: process.status,
      title: process.title,
      description: process.description,
      startedAt: process.startedAt,
      finishedAt: process.finishedAt,
      createdAt: process.createdAt,
      updatedAt: process.updatedAt,
    };
  }
}
