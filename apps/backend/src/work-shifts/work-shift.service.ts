import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, WorkShiftPhotoType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ArtifactRecord } from '../artifacts/artifact-record.js';
import { ArtifactService, UploadedPhotoObject } from '../artifacts/artifact.service.js';
import { UploadedArtifactFile } from '../artifacts/uploaded-artifact-file.js';
import { AuthUser } from '../auth/auth-user.js';
import { DatabaseService } from '../database/database.service.js';
import { EventService } from '../events/event.service.js';
import { ProcessRepository } from '../processes/process.repository.js';
import { ProcessService } from '../processes/process.service.js';
import { ShiftPhotoActionDto } from './dto/shift-photo-action.dto.js';
import { WorkShiftPhotoRecord } from './work-shift-photo-record.js';
import { WorkShiftPhotoRepository } from './work-shift-photo.repository.js';
import { WorkShiftRecord } from './work-shift-record.js';
import { WorkShiftRepository } from './work-shift.repository.js';

const defaultHistoryLimit = 100;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WorkShiftPhotoActionResult {
  shift: WorkShiftRecord;
  photo: WorkShiftPhotoRecord;
  artifact: ArtifactRecord;
}

@Injectable()
export class WorkShiftService {
  constructor(
    private readonly repository: WorkShiftRepository,
    private readonly events: EventService,
    private readonly processes: ProcessService,
    private readonly database: DatabaseService,
    private readonly artifacts: ArtifactService,
    private readonly processRepository: ProcessRepository,
    private readonly shiftPhotos: WorkShiftPhotoRepository,
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

  async startShiftWithPhoto(
    user: AuthUser,
    dto: ShiftPhotoActionDto,
    file: UploadedArtifactFile,
  ): Promise<WorkShiftPhotoActionResult> {
    assertWorkerUser(user);
    const action = this.parsePhotoActionDto(dto);
    const existing = await this.findExistingOperation(action.operationId, user, 'START');

    if (existing) {
      return existing;
    }

    const active = await this.repository.findActiveByUserId(user.id);

    if (active) {
      throw new ConflictException('Active work shift already exists');
    }

    const uploaded = this.artifacts.preparePhotoObject(user, file);

    return this.executePhotoActionWithCompensation(
      uploaded,
      async (client, storePhoto) => {
        const duplicate = await this.findExistingOperation(action.operationId, user, 'START', client);

        if (duplicate) {
          return duplicate;
        }

        const activeInTransaction = await this.repository.findActiveByUserId(user.id, client);

        if (activeInTransaction) {
          throw new ConflictException('Active work shift already exists');
        }

        const now = new Date();
        const shiftId = randomUUID();
        const artifactId = randomUUID();
        const photoId = randomUUID();
        const process = await this.processRepository.create(
          {
            type: 'WORK_SHIFT',
            title: 'Work shift',
            description: 'Employee work shift lifecycle',
          },
          client,
        );
        const activeProcess = await this.processRepository.updateStatus(
          process.id,
          'ACTIVE',
          { startedAt: now },
          client,
        );

        const artifact = await this.createShiftPhotoArtifact(user, uploaded, client, {
          artifactId,
          workShiftId: shiftId,
          processId: activeProcess.id,
          workShiftPhotoId: photoId,
          operationId: action.operationId,
          type: 'START',
          timestamp: now,
        });
        const shift = await this.repository.create(
          {
            id: shiftId,
            userId: user.id,
            processId: activeProcess.id,
            startedAt: now,
          },
          client,
        );
        const photo = await this.shiftPhotos.create(
          {
            id: photoId,
            workShiftId: shift.id,
            artifactId: artifact.id,
            type: 'START',
            capturedAt: action.capturedAt,
            source: 'DIRECT_CAMERA_CAPTURE',
            timezone: action.timezone,
            width: uploaded.inspection.width,
            height: uploaded.inspection.height,
            operationId: action.operationId,
          },
          client,
        );

        await storePhoto();
        await this.createWorkShiftEvent('WORK_SHIFT_STARTED', user, shift, photo, artifact, now, client);

        return {
          shift,
          photo,
          artifact,
        };
      },
      () => this.findExistingOperation(action.operationId, user, 'START'),
    );
  }

  async finishShiftWithPhoto(
    user: AuthUser,
    dto: ShiftPhotoActionDto,
    file: UploadedArtifactFile,
  ): Promise<WorkShiftPhotoActionResult> {
    assertWorkerUser(user);
    const action = this.parsePhotoActionDto(dto);
    const existing = await this.findExistingOperation(action.operationId, user, 'FINISH');

    if (existing) {
      return existing;
    }

    const active = await this.repository.findActiveByUserId(user.id);

    if (!active) {
      throw new ConflictException('Active work shift not found');
    }

    const uploaded = this.artifacts.preparePhotoObject(user, file);

    return this.executePhotoActionWithCompensation(uploaded, async (client, storePhoto) => {
      const duplicate = await this.findExistingOperation(action.operationId, user, 'FINISH', client);

      if (duplicate) {
        return duplicate;
      }

      const activeInTransaction = await this.repository.findActiveByUserId(user.id, client);

      if (!activeInTransaction) {
        throw new ConflictException('Active work shift not found');
      }

      const now = new Date();
      const artifactId = randomUUID();
      const photoId = randomUUID();
      const artifact = await this.createShiftPhotoArtifact(
        user,
        uploaded,
        client,
        {
          artifactId,
          workShiftId: activeInTransaction.id,
          processId: activeInTransaction.processId,
          workShiftPhotoId: photoId,
          operationId: action.operationId,
          type: 'FINISH',
          timestamp: now,
        },
      );
      const photo = await this.shiftPhotos.create(
        {
          id: photoId,
          workShiftId: activeInTransaction.id,
          artifactId: artifact.id,
          type: 'FINISH',
          capturedAt: action.capturedAt,
          source: 'DIRECT_CAMERA_CAPTURE',
          timezone: action.timezone,
          width: uploaded.inspection.width,
          height: uploaded.inspection.height,
          operationId: action.operationId,
        },
        client,
      );
      const shift = await this.repository.finish(activeInTransaction.id, now, client);

      if (shift.processId) {
        await this.processRepository.updateStatus(
          shift.processId,
          'COMPLETED',
          { finishedAt: now },
          client,
        );
      }

      await storePhoto();
      await this.createWorkShiftEvent('WORK_SHIFT_FINISHED', user, shift, photo, artifact, now, client);

      return {
        shift,
        photo,
        artifact,
      };
    }, () => this.findExistingOperation(action.operationId, user, 'FINISH'));
  }

  history(user: AuthUser): Promise<WorkShiftRecord[]> {
    assertAuthUser(user);

    return this.repository.findManyByUserId(user.id, defaultHistoryLimit);
  }

  private async executePhotoActionWithCompensation(
    uploaded: UploadedPhotoObject,
    action: (
      client: Prisma.TransactionClient,
      storePhoto: () => Promise<void>,
    ) => Promise<WorkShiftPhotoActionResult>,
    recoverUniqueConflict: () => Promise<WorkShiftPhotoActionResult | null>,
  ): Promise<WorkShiftPhotoActionResult> {
    let stored = false;

    try {
      return await this.database.$transaction(async (client) => {
        const result = await action(client, async () => {
          await this.artifacts.storePreparedPhoto(uploaded);
          stored = true;
        });

        return result;
      });
    } catch (error) {
      if (stored) {
        await this.artifacts.deleteStoredPhoto(uploaded.storageKey);
      }

      if (isPrismaUniqueConstraintError(error)) {
        const existing = await recoverUniqueConflict();

        if (existing) {
          return existing;
        }

        throw new ConflictException('Work shift photo operation conflicts with existing data');
      }

      throw error;
    }
  }

  private async findExistingOperation(
    operationId: string,
    user: AuthUser,
    type: WorkShiftPhotoType,
    client?: Prisma.TransactionClient,
  ): Promise<WorkShiftPhotoActionResult | null> {
    const existing = await this.shiftPhotos.findByOperationId(operationId, client);

    if (!existing) {
      return null;
    }

    if (existing.shift.userId !== user.id || existing.photo.type !== type) {
      throw new ConflictException('Operation id belongs to another work shift action');
    }

    return existing;
  }

  private async createShiftPhotoArtifact(
    user: AuthUser,
    uploaded: UploadedPhotoObject,
    client: Prisma.TransactionClient,
    context: {
      artifactId: string;
      workShiftId: string;
      processId: string | null;
      workShiftPhotoId: string;
      operationId: string;
      type: WorkShiftPhotoType;
      timestamp: Date;
    },
  ): Promise<ArtifactRecord> {
    return this.artifacts.createPhotoArtifactRecord(
      user,
      {},
      uploaded,
      client,
      {
        artifactId: context.artifactId,
        eventEntityId: context.artifactId,
        eventPayload: {
          workShiftId: context.workShiftId,
          processId: context.processId,
          workShiftPhotoId: context.workShiftPhotoId,
          artifactId: context.artifactId,
          operationId: context.operationId,
          source: 'DIRECT_CAMERA_CAPTURE',
          status: context.type,
          timestamp: context.timestamp.toISOString(),
        },
        eventMetadata: {
          source: 'work-shift-photo-fixation',
        },
      },
    );
  }

  private async createWorkShiftEvent(
    type: 'WORK_SHIFT_STARTED' | 'WORK_SHIFT_FINISHED',
    user: AuthUser,
    shift: WorkShiftRecord,
    photo: WorkShiftPhotoRecord,
    artifact: ArtifactRecord,
    timestamp: Date,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    await this.events.createEvent(
      {
        type,
        actorId: user.id,
        entityType: 'work_shift',
        entityId: shift.id,
        payload: {
          workShiftId: shift.id,
          processId: shift.processId,
          workShiftPhotoId: photo.id,
          artifactId: artifact.id,
          operationId: photo.operationId,
          source: photo.source,
          status: shift.status,
          timestamp: timestamp.toISOString(),
        },
        metadata: {
          source: 'work-shift-photo-fixation',
        },
      },
      client,
    );
  }

  private parsePhotoActionDto(dto: ShiftPhotoActionDto): {
    capturedAt: Date;
    timezone: string;
    operationId: string;
  } {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Work shift photo body is required');
    }

    if (typeof dto.operationId !== 'string' || !uuidPattern.test(dto.operationId)) {
      throw new BadRequestException('Work shift operationId must be a UUID');
    }

    if (typeof dto.timezone !== 'string' || dto.timezone.trim().length === 0) {
      throw new BadRequestException('Work shift timezone is required');
    }

    if (typeof dto.capturedAt !== 'string' || dto.capturedAt.trim().length === 0) {
      throw new BadRequestException('Work shift capturedAt is required');
    }

    const capturedAt = new Date(dto.capturedAt);

    if (Number.isNaN(capturedAt.getTime())) {
      throw new BadRequestException('Work shift capturedAt must be a valid date');
    }

    return {
      capturedAt,
      timezone: dto.timezone,
      operationId: dto.operationId,
    };
  }
}

function assertAuthUser(user: AuthUser): void {
  if (!user?.id) {
    throw new BadRequestException('Authenticated user is required');
  }
}

function assertWorkerUser(user: AuthUser): void {
  assertAuthUser(user);

  if (user.role !== 'WORKER') {
    throw new ForbiddenException('Work shift photo fixation is available only for workers');
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
