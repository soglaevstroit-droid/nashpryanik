import { ArtifactType } from '@prisma/client';
import { Readable } from 'node:stream';

export interface ArtifactRecord {
  id: string;
  type: ArtifactType;
  eventId: string;
  taskId: string | null;
  taskStepId: string | null;
  workShiftId?: string | null;
  uploadedBy: string;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: Date;
}

export interface ArtifactDownload {
  artifact: ArtifactRecord;
  stream: Readable;
}
