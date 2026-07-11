import { ArtifactSource, WorkShiftPhotoType } from '@prisma/client';

export interface WorkShiftPhotoRecord {
  id: string;
  workShiftId: string;
  artifactId: string;
  type: WorkShiftPhotoType;
  capturedAt: Date;
  receivedAt: Date;
  source: ArtifactSource;
  timezone: string;
  width: number;
  height: number;
  operationId: string;
  createdAt: Date;
}
