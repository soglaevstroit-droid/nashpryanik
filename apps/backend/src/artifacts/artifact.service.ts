import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth-user.js';
import { EventService } from '../events/event.service.js';
import { UploadPhotoDto } from './dto/upload-photo.dto.js';
import { ArtifactDownload, ArtifactRecord } from './artifact-record.js';
import { ArtifactRepository } from './artifact.repository.js';
import { ArtifactStorageService } from './artifact-storage.service.js';
import { UploadedArtifactFile } from './uploaded-artifact-file.js';
import { DatabaseService } from '../database/database.service.js';
import { ActiveShiftAccessService } from '../work-shifts/active-shift-access.service.js';

const maxPhotoFileSizeBytes = 10 * 1024 * 1024;
const allowedPhotoMimeTypes = new Set(['image/jpeg', 'image/webp']);
const defaultArtifactListLimit = 100;

export interface PhotoInspection {
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
  extension: string;
}

export interface UploadedPhotoObject {
  storageKey: string;
  file: UploadedArtifactFile;
  inspection: PhotoInspection;
}

interface CreatePhotoArtifactRecordOptions {
  artifactId?: string;
  eventEntityId?: string;
  eventPayload?: Record<string, unknown>;
  eventMetadata?: Record<string, unknown>;
  workShiftId?: string | null;
}

@Injectable()
export class ArtifactService {
  constructor(
    private readonly repository: ArtifactRepository,
    private readonly storage: ArtifactStorageService,
    private readonly events: EventService,
    private readonly database?: DatabaseService,
    private readonly activeShiftAccess?: ActiveShiftAccessService,
  ) {}

  async uploadPhoto(
    user: AuthUser,
    dto: UploadPhotoDto,
    file: UploadedArtifactFile,
  ): Promise<ArtifactRecord> {
    assertAuthUser(user);
    assertUploadPhotoDto(dto);
    if (user.role === 'WORKER' && (dto.taskId || dto.taskStepId))
      await this.activeShiftAccess?.assertActiveShift(user);
    await this.assertUploadContext(user, dto);
    if (dto.operationId && this.database) {
      const existingEvent = await this.database.event.findUnique({
        where: { idempotencyKey: `photo:${user.id}:${dto.operationId}` },
      });
      if (existingEvent) {
        const existing = await this.database.artifact.findFirst({
          where: { eventId: existingEvent.id },
        });
        if (existing) return existing;
      }
    }
    const uploaded = await this.uploadPhotoObject(user, file);

    try {
      return this.database
        ? await this.database.$transaction((client) =>
            this.createPhotoArtifactRecord(user, dto, uploaded, client),
          )
        : await this.createPhotoArtifactRecord(user, dto, uploaded);
    } catch (error) {
      await this.deleteStoredPhoto(uploaded.storageKey);
      throw error;
    }
  }

  inspectPhotoFile(file: UploadedArtifactFile): PhotoInspection {
    return inspectPhotoFile(file);
  }

  async uploadPhotoObject(
    user: AuthUser,
    file: UploadedArtifactFile,
  ): Promise<UploadedPhotoObject> {
    const uploaded = this.preparePhotoObject(user, file);
    await this.storePreparedPhoto(uploaded);

    return uploaded;
  }

  preparePhotoObject(user: AuthUser, file: UploadedArtifactFile): UploadedPhotoObject {
    assertAuthUser(user);
    const inspection = this.inspectPhotoFile(file);
    const normalizedFile = normalizeUploadedPhotoFile(file, inspection);
    const storageKey = this.storage.generatePhotoStorageKey(user.id, normalizedFile.originalname);

    return {
      storageKey,
      file: normalizedFile,
      inspection,
    };
  }

  async storePreparedPhoto(uploaded: UploadedPhotoObject): Promise<void> {
    await this.storage.uploadPhoto(uploaded.storageKey, uploaded.file);
  }

  async createPhotoArtifactRecord(
    user: AuthUser,
    dto: UploadPhotoDto,
    uploaded: UploadedPhotoObject,
    client?: Prisma.TransactionClient,
    options: CreatePhotoArtifactRecordOptions = {},
  ): Promise<ArtifactRecord> {
    assertAuthUser(user);
    assertUploadPhotoDto(dto);

    const { file, storageKey } = uploaded;

    const event = await this.events.createEvent(
      {
        type: 'PHOTO_UPLOADED',
        actorId: user.id,
        entityType: 'artifact',
        entityId: options.eventEntityId ?? null,
        taskId: dto.taskId ?? null,
        taskStepId: dto.taskStepId ?? null,
        workShiftId: options.workShiftId ?? null,
        idempotencyKey: dto.operationId ? `photo:${user.id}:${dto.operationId}` : undefined,
        payload: {
          artifactType: 'PHOTO',
          taskId: dto.taskId ?? null,
          taskStepId: dto.taskStepId ?? null,
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          storageKey,
          ...options.eventPayload,
        },
        metadata: {
          source: 'artifact-foundation',
          ...options.eventMetadata,
        },
      },
      client,
    );

    return this.repository.create(
      {
        id: options.artifactId,
        type: 'PHOTO',
        eventId: event.id,
        taskId: dto.taskId ?? null,
        taskStepId: dto.taskStepId ?? null,
        workShiftId: options.workShiftId ?? null,
        uploadedBy: user.id,
        storageKey,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      },
      client,
    );
  }

  async deleteStoredPhoto(storageKey: string): Promise<void> {
    await this.storage.deleteObject(storageKey).catch((error: unknown) => {
      console.error('Failed to delete orphan photo object', { storageKey, error });
    });
  }

  async getPhoto(userOrId: AuthUser | string, id?: string): Promise<ArtifactDownload> {
    const artifact = await this.getArtifactRecord(typeof userOrId === 'string' ? userOrId : id!);
    if (typeof userOrId !== 'string') await this.assertCanAccess(userOrId, artifact);
    const stream = await this.storage.getObject(artifact.storageKey);

    return {
      artifact,
      stream,
    };
  }

  async listPhotos(userOrEventId: AuthUser | string, eventId?: string): Promise<ArtifactRecord[]> {
    const resolvedEventId = typeof userOrEventId === 'string' ? userOrEventId : eventId!;
    assertEventId(resolvedEventId);

    const photos = await this.repository.findManyByEventId(
      resolvedEventId,
      defaultArtifactListLimit,
    );
    if (typeof userOrEventId !== 'string')
      for (const photo of photos) await this.assertCanAccess(userOrEventId, photo);
    return photos;
  }

  async deletePhoto(userOrId: AuthUser | string, id?: string): Promise<ArtifactRecord> {
    const artifact = await this.getArtifactRecord(typeof userOrId === 'string' ? userOrId : id!);
    if (typeof userOrId !== 'string') {
      await this.assertCanAccess(userOrId, artifact);
      if (userOrId.role === 'WORKER') {
        await this.activeShiftAccess?.assertActiveShift(userOrId);
        if (!artifact.taskStepId || !this.database)
          throw new BadRequestException('Only current step photos can be deleted');
        const step = await this.database.taskStep.findUnique({
          where: { id: artifact.taskStepId },
          include: { task: true },
        });
        if (
          !step ||
          step.status !== 'IN_PROGRESS' ||
          step.task.status !== 'IN_PROGRESS' ||
          step.task.isWorkBlocked ||
          step.task.deletedAt
        )
          throw new BadRequestException('Photo can no longer be deleted');
      }
    }

    await this.storage.deleteObject(artifact.storageKey);

    return this.repository.delete(artifact.id);
  }

  private async assertCanAccess(user: AuthUser, artifact: ArtifactRecord): Promise<void> {
    if (user.role !== 'WORKER' || artifact.uploadedBy === user.id) return;
    if (artifact.taskId && this.database) {
      const task = await this.database.task.findUnique({
        where: { id: artifact.taskId },
        select: { assigneeId: true },
      });
      if (task?.assigneeId === user.id) return;
    }
    throw new NotFoundException('Photo not found');
  }

  private async assertUploadContext(user: AuthUser, dto: UploadPhotoDto): Promise<void> {
    if (user.role !== 'WORKER' || !this.database) return;
    if (!dto.taskStepId) throw new BadRequestException('Task step is required for worker photo');
    const step = await this.database.taskStep.findUnique({
      where: { id: dto.taskStepId },
      include: {
        task: { include: { steps: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } } },
      },
    });
    if (!step || step.task.assigneeId !== user.id || step.task.deletedAt)
      throw new NotFoundException('Task not found');
    if (dto.taskId && dto.taskId !== step.taskId)
      throw new BadRequestException('Task step does not belong to task');
    if (
      step.task.status !== 'IN_PROGRESS' ||
      step.task.isWorkBlocked ||
      step.status !== 'IN_PROGRESS'
    )
      throw new BadRequestException('Photos can be added only to the active step');
    const active = step.task.steps.filter((candidate) => candidate.status === 'IN_PROGRESS');
    if (active.length !== 1 || active[0].id !== step.id)
      throw new BadRequestException('Another task step is active');
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
  assertNullableString(dto.operationId, 'operationId');
}

function inspectPhotoFile(file: UploadedArtifactFile): PhotoInspection {
  if (!file?.buffer || !file.originalname || !file.mimetype) {
    throw new BadRequestException('Photo file is required');
  }

  if (file.size <= 0 || file.size > maxPhotoFileSizeBytes) {
    throw new BadRequestException('Photo file size is invalid');
  }

  const inspection = inspectImageBuffer(file.buffer);

  if (!allowedPhotoMimeTypes.has(inspection.mimeType)) {
    throw new BadRequestException('Photo MIME type is not supported');
  }

  return {
    ...inspection,
    fileSize: file.size,
  };
}

function normalizeUploadedPhotoFile(
  file: UploadedArtifactFile,
  inspection: PhotoInspection,
): UploadedArtifactFile {
  return {
    ...file,
    originalname: normalizePhotoFileName(file.originalname, inspection.extension),
    mimetype: inspection.mimeType,
    size: file.size,
  };
}

function normalizePhotoFileName(fileName: string, extension: string): string {
  const trimmedName = fileName.trim() || 'photo';
  const baseName = trimmedName.replace(/\.[^.]+$/, '');

  return `${baseName}.${extension}`;
}

function inspectImageBuffer(buffer: Buffer): Omit<PhotoInspection, 'fileSize'> {
  const jpeg = inspectJpegBuffer(buffer);

  if (jpeg) {
    return jpeg;
  }

  const webp = inspectWebpBuffer(buffer);

  if (webp) {
    return webp;
  }

  throw new BadRequestException('Photo file is not a supported image');
}

function inspectJpegBuffer(buffer: Buffer): Omit<PhotoInspection, 'fileSize'> | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 2 > buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);

    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      throw new BadRequestException('Photo JPEG structure is invalid');
    }

    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 7) {
        throw new BadRequestException('Photo JPEG dimensions are invalid');
      }

      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);

      assertImageDimensions(width, height);

      return {
        mimeType: 'image/jpeg',
        width,
        height,
        extension: 'jpg',
      };
    }

    offset += segmentLength;
  }

  throw new BadRequestException('Photo JPEG dimensions were not found');
}

function isJpegStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function inspectWebpBuffer(buffer: Buffer): Omit<PhotoInspection, 'fileSize'> | null {
  if (
    buffer.length < 30 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  const chunkType = buffer.toString('ascii', 12, 16);

  if (chunkType === 'VP8X') {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    assertImageDimensions(width, height);

    return {
      mimeType: 'image/webp',
      width,
      height,
      extension: 'webp',
    };
  }

  if (chunkType === 'VP8 ') {
    if (buffer.length < 30 || buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      throw new BadRequestException('Photo WebP structure is invalid');
    }

    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    assertImageDimensions(width, height);

    return {
      mimeType: 'image/webp',
      width,
      height,
      extension: 'webp',
    };
  }

  if (chunkType === 'VP8L') {
    if (buffer.length < 25 || buffer[20] !== 0x2f) {
      throw new BadRequestException('Photo WebP structure is invalid');
    }

    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    assertImageDimensions(width, height);

    return {
      mimeType: 'image/webp',
      width,
      height,
      extension: 'webp',
    };
  }

  throw new BadRequestException('Photo WebP structure is unsupported');
}

function assertImageDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new BadRequestException('Photo dimensions are invalid');
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
