CREATE TYPE "WorkShiftStatus" AS ENUM (
    'NOT_STARTED',
    'ACTIVE',
    'FINISHED'
);

CREATE TABLE "work_shifts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "processId" TEXT,
    "status" "WorkShiftStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_shifts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_shifts_userId_idx" ON "work_shifts"("userId");
CREATE INDEX "work_shifts_status_idx" ON "work_shifts"("status");
CREATE INDEX "work_shifts_startedAt_idx" ON "work_shifts"("startedAt");
CREATE INDEX "work_shifts_processId_idx" ON "work_shifts"("processId");
CREATE UNIQUE INDEX "work_shifts_one_active_per_user_idx" ON "work_shifts"("userId") WHERE "status" = 'ACTIVE';
