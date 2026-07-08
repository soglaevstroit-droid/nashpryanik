CREATE TYPE "ProcessStatus" AS ENUM (
    'CREATED',
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'CANCELLED'
);

CREATE TABLE "processes" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ProcessStatus" NOT NULL DEFAULT 'CREATED',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "processes_type_idx" ON "processes"("type");
CREATE INDEX "processes_status_idx" ON "processes"("status");
CREATE INDEX "processes_createdAt_idx" ON "processes"("createdAt");
