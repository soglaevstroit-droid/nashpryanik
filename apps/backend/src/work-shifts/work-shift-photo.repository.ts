import { Injectable } from '@nestjs/common';
import { Artifact, Prisma, WorkShift, WorkShiftPhoto, WorkShiftPhotoType } from '@prisma/client';
import { DatabaseService } from '../database/database.service.js';
import { ArtifactRecord } from '../artifacts/artifact-record.js';
import { WorkShiftPhotoRecord } from './work-shift-photo-record.js';
import { WorkShiftRecord } from './work-shift-record.js';

interface CreateWorkShiftPhotoData {
  id?: string;
  workShiftId: string;
  artifactId: string;
  type: WorkShiftPhotoType;
  capturedAt: Date;
  source: 'DIRECT_CAMERA_CAPTURE';
  timezone: string;
  width: number;
  height: number;
  operationId: string;
}

export interface WorkShiftPhotoBundle {
  shift: WorkShiftRecord;
  photo: WorkShiftPhotoRecord;
  artifact: ArtifactRecord;
}

@Injectable()
export class WorkShiftPhotoRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(
    data: CreateWorkShiftPhotoData,
    client: Prisma.TransactionClient = this.database,
  ): Promise<WorkShiftPhotoRecord> {
    const photo = await client.workShiftPhoto.create({
      data,
    });

    return this.toPhotoRecord(photo);
  }

  async findByOperationId(
    operationId: string,
    client: Prisma.TransactionClient = this.database,
  ): Promise<WorkShiftPhotoBundle | null> {
    const photo = await client.workShiftPhoto.findUnique({
      where: { operationId },
      include: {
        artifact: true,
        workShift: true,
      },
    });

    if (!photo) {
      return null;
    }

    return {
      shift: this.toShiftRecord(photo.workShift),
      photo: this.toPhotoRecord(photo),
      artifact: this.toArtifactRecord(photo.artifact),
    };
  }

  private toPhotoRecord(photo: WorkShiftPhoto): WorkShiftPhotoRecord {
    return {
      id: photo.id,
      workShiftId: photo.workShiftId,
      artifactId: photo.artifactId,
      type: photo.type,
      capturedAt: photo.capturedAt,
      receivedAt: photo.receivedAt,
      source: photo.source,
      timezone: photo.timezone,
      width: photo.width,
      height: photo.height,
      operationId: photo.operationId,
      createdAt: photo.createdAt,
    };
  }

  private toShiftRecord(shift: WorkShift): WorkShiftRecord {
    return {
      id: shift.id,
      userId: shift.userId,
      processId: shift.processId,
      status: shift.status,
      startedAt: shift.startedAt,
      finishedAt: shift.finishedAt,
      createdAt: shift.createdAt,
      updatedAt: shift.updatedAt,
    };
  }

  private toArtifactRecord(artifact: Artifact): ArtifactRecord {
    return {
      id: artifact.id,
      type: artifact.type,
      eventId: artifact.eventId,
      taskId: artifact.taskId,
      taskStepId: artifact.taskStepId,
      uploadedBy: artifact.uploadedBy,
      storageKey: artifact.storageKey,
      previewStorageKey: artifact.previewStorageKey,
      originalFileName: artifact.originalFileName,
      mimeType: artifact.mimeType,
      previewMimeType: artifact.previewMimeType,
      fileSize: artifact.fileSize,
      previewFileSize: artifact.previewFileSize,
      createdAt: artifact.createdAt,
    };
  }
}
