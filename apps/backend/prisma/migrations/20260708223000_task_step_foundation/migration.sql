ALTER TYPE "EventType" ADD VALUE 'STEP_CANCELLED';

CREATE TYPE "TaskStepStatus" AS ENUM (
  'CREATED',
  'IN_PROGRESS',
  'COMPLETED',
  'REOPENED',
  'CANCELLED'
);

CREATE TABLE "task_steps" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "TaskStepStatus" NOT NULL DEFAULT 'CREATED',
  "order" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "task_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_steps_taskId_idx" ON "task_steps"("taskId");
CREATE INDEX "task_steps_status_idx" ON "task_steps"("status");
CREATE INDEX "task_steps_order_idx" ON "task_steps"("order");
CREATE INDEX "task_steps_createdAt_idx" ON "task_steps"("createdAt");
