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
  previewStorageKey: string | null;
  originalFileName: string;
  mimeType: string;
  previewMimeType: string | null;
  fileSize: number;
  previewFileSize: number | null;
  createdAt: Date;
}

export interface ArtifactDownload {
  artifact: ArtifactRecord;
  stream: Readable;
  mimeType: string;
}
