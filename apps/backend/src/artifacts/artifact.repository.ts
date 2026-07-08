import { Injectable } from '@nestjs/common';
import { ArtifactType } from '@prisma/client';
import { DatabaseService } from '../database/database.service.js';
import { ArtifactRecord } from './artifact-record.js';

interface CreateArtifactData {
  type: ArtifactType;
  eventId: string;
  taskId?: string | null;
  taskStepId?: string | null;
  uploadedBy: string;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
}

@Injectable()
export class ArtifactRepository {
  constructor(private readonly database: DatabaseService) {}

  create(data: CreateArtifactData): Promise<ArtifactRecord> {
    return this.database.artifact.create({
      data,
    });
  }

  findById(id: string): Promise<ArtifactRecord | null> {
    return this.database.artifact.findUnique({
      where: { id },
    });
  }

  findManyByEventId(eventId: string, limit: number): Promise<ArtifactRecord[]> {
    return this.database.artifact.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  delete(id: string): Promise<ArtifactRecord> {
    return this.database.artifact.delete({
      where: { id },
    });
  }
}
