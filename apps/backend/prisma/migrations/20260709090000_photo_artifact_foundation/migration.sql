CREATE TYPE "ArtifactType" AS ENUM (
  'PHOTO'
);

CREATE TABLE "artifacts" (
  "id" TEXT NOT NULL,
  "type" "ArtifactType" NOT NULL DEFAULT 'PHOTO',
  "eventId" TEXT NOT NULL,
  "taskId" TEXT,
  "taskStepId" TEXT,
  "uploadedBy" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "artifacts_type_idx" ON "artifacts"("type");
CREATE INDEX "artifacts_eventId_idx" ON "artifacts"("eventId");
CREATE INDEX "artifacts_taskId_idx" ON "artifacts"("taskId");
CREATE INDEX "artifacts_taskStepId_idx" ON "artifacts"("taskStepId");
CREATE INDEX "artifacts_uploadedBy_idx" ON "artifacts"("uploadedBy");
CREATE INDEX "artifacts_createdAt_idx" ON "artifacts"("createdAt");
