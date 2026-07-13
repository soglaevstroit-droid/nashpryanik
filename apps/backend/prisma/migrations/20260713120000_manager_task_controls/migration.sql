CREATE TYPE "TaskAccessStatus" AS ENUM ('OPEN', 'CLOSED');

ALTER TYPE "TaskPriority" ADD VALUE IF NOT EXISTS 'URGENT';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'TASK_PRIORITY_CHANGED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'TASK_ACCESS_OPENED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'TASK_ACCESS_CLOSED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'TASK_DELETED';

ALTER TABLE "tasks"
  ADD COLUMN "accessStatus" "TaskAccessStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByUserId" TEXT,
  ADD COLUMN "deletionReason" TEXT,
  ADD COLUMN "creationOperationId" TEXT;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "assigneeId" ORDER BY "createdAt", id)::INTEGER AS position
  FROM "tasks"
  WHERE "deletedAt" IS NULL
)
UPDATE "tasks" SET position = ranked.position FROM ranked WHERE "tasks".id = ranked.id;

CREATE UNIQUE INDEX "tasks_creationOperationId_key" ON "tasks"("creationOperationId");
CREATE INDEX "tasks_assigneeId_deletedAt_position_idx" ON "tasks"("assigneeId", "deletedAt", "position");
