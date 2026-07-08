import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { EventService } from '../events/event.service.js';
import { UploadPhotoDto } from './dto/upload-photo.dto.js';
import { ArtifactDownload, ArtifactRecord } from './artifact-record.js';
import { ArtifactRepository } from './artifact.repository.js';
import { ArtifactStorageService } from './artifact-storage.service.js';
import { UploadedArtifactFile } from './uploaded-artifact-file.js';

const maxPhotoFileSizeBytes = 10 * 1024 * 1024;
const allowedPhotoMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const defaultArtifactListLimit = 100;

@Injectable()
export class ArtifactService {
  constructor(
    private readonly repository: ArtifactRepository,
    private readonly storage: ArtifactStorageService,
    private readonly events: EventService,
  ) {}

  async uploadPhoto(
    user: AuthUser,
    dto: UploadPhotoDto,
    file: UploadedArtifactFile,
  ): Promise<ArtifactRecord> {
    assertAuthUser(user);
    assertUploadPhotoDto(dto);
    assertPhotoFile(file);

    const storageKey = this.storage.generatePhotoStorageKey(user.id, file.originalname);
    await this.storage.uploadPhoto(storageKey, file);

    try {
      const event = await this.events.createEvent({
        type: 'PHOTO_UPLOADED',
        actorId: user.id,
        entityType: 'artifact',
        payload: {
          artifactType: 'PHOTO',
          taskId: dto.taskId ?? null,
          taskStepId: dto.taskStepId ?? null,
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          storageKey,
        },
        metadata: {
          source: 'artifact-foundation',
        },
      });

      return await this.repository.create({
        type: 'PHOTO',
        eventId: event.id,
        taskId: dto.taskId ?? null,
        taskStepId: dto.taskStepId ?? null,
        uploadedBy: user.id,
        storageKey,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
    } catch (error) {
      await this.storage.deleteObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async getPhoto(id: string): Promise<ArtifactDownload> {
    const artifact = await this.getArtifactRecord(id);
    const stream = await this.storage.getObject(artifact.storageKey);

    return {
      artifact,
      stream,
    };
  }

  async listPhotos(eventId: string): Promise<ArtifactRecord[]> {
    assertEventId(eventId);

    return this.repository.findManyByEventId(eventId, defaultArtifactListLimit);
  }

  async deletePhoto(id: string): Promise<ArtifactRecord> {
    const artifact = await this.getArtifactRecord(id);

    await this.storage.deleteObject(artifact.storageKey);

    return this.repository.delete(id);
  }

  private async getArtifactRecord(id: string): Promise<ArtifactRecord> {
    assertArtifactId(id);

    const artifact = await this.repository.findById(id);

    if (!artifact) {
      throw new NotFoundException('Artifact not found');
    }

    if (artifact.type !== 'PHOTO') {
      throw new BadRequestException('Artifact is not a photo');
    }

    return artifact;
  }
}

function assertAuthUser(user: AuthUser): void {
  if (!user?.id) {
    throw new BadRequestException('Authenticated user is required');
  }
}

function assertUploadPhotoDto(dto: UploadPhotoDto): void {
  if (!dto || typeof dto !== 'object') {
    throw new BadRequestException('Photo upload body is required');
  }

  assertNullableString(dto.taskId, 'taskId');
  assertNullableString(dto.taskStepId, 'taskStepId');
}

function assertPhotoFile(file: UploadedArtifactFile): void {
  if (!file?.buffer || !file.originalname || !file.mimetype) {
    throw new BadRequestException('Photo file is required');
  }

  if (file.size <= 0 || file.size > maxPhotoFileSizeBytes) {
    throw new BadRequestException('Photo file size is invalid');
  }

  if (!allowedPhotoMimeTypes.has(file.mimetype)) {
    throw new BadRequestException('Photo MIME type is not supported');
  }
}

function assertNullableString(value: unknown, fieldName: string): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new BadRequestException(`Photo ${fieldName} must be a string or null`);
  }
}

function assertArtifactId(id: string): void {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new BadRequestException('Artifact id is required');
  }
}

function assertEventId(eventId: string): void {
  if (typeof eventId !== 'string' || eventId.trim().length === 0) {
    throw new BadRequestException('Event id is required');
  }
}
