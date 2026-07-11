CREATE TYPE "WorkShiftPhotoType" AS ENUM ('START', 'FINISH');

CREATE TYPE "ArtifactSource" AS ENUM ('DIRECT_CAMERA_CAPTURE');

CREATE TABLE "work_shift_photos" (
    "id" TEXT NOT NULL,
    "workShiftId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "type" "WorkShiftPhotoType" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "ArtifactSource" NOT NULL,
    "timezone" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "operationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_shift_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_shift_photos_artifactId_key" ON "work_shift_photos"("artifactId");
CREATE UNIQUE INDEX "work_shift_photos_operationId_key" ON "work_shift_photos"("operationId");
CREATE UNIQUE INDEX "work_shift_photos_workShiftId_type_key" ON "work_shift_photos"("workShiftId", "type");
CREATE INDEX "work_shift_photos_workShiftId_idx" ON "work_shift_photos"("workShiftId");
CREATE INDEX "work_shift_photos_artifactId_idx" ON "work_shift_photos"("artifactId");
CREATE INDEX "work_shift_photos_type_idx" ON "work_shift_photos"("type");
CREATE INDEX "work_shift_photos_capturedAt_idx" ON "work_shift_photos"("capturedAt");

ALTER TABLE "work_shift_photos"
  ADD CONSTRAINT "work_shift_photos_workShiftId_fkey"
  FOREIGN KEY ("workShiftId") REFERENCES "work_shifts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_shift_photos"
  ADD CONSTRAINT "work_shift_photos_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "artifacts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
