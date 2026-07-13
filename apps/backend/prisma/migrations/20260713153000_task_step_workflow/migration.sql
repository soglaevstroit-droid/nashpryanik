ALTER TABLE "tasks"
  ADD COLUMN "isWorkBlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "workBlockedAt" TIMESTAMP(3),
  ADD COLUMN "workBlockedByUserId" TEXT;

ALTER TABLE "task_steps"
  ADD COLUMN "completedByUserId" TEXT,
  ADD COLUMN "minimumPhotoCount" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "completionOperationId" TEXT;

CREATE UNIQUE INDEX "task_steps_completionOperationId_key"
  ON "task_steps"("completionOperationId");

ALTER TABLE "task_steps"
  ADD CONSTRAINT "task_steps_minimumPhotoCount_check"
  CHECK ("minimumPhotoCount" >= 0);
