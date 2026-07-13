ALTER TYPE "TaskMessageKind" ADD VALUE IF NOT EXISTS 'TASK_UPDATED';

ALTER TABLE "task_messages"
  ADD COLUMN "readAt" TIMESTAMP(3),
  ADD COLUMN "recipientId" TEXT;

CREATE INDEX "task_messages_recipientId_createdAt_idx"
  ON "task_messages"("recipientId", "createdAt");

ALTER TABLE "task_steps"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByUserId" TEXT,
  ADD COLUMN "deletionReason" TEXT;

CREATE INDEX "task_steps_taskId_deletedAt_order_idx"
  ON "task_steps"("taskId", "deletedAt", "order");
