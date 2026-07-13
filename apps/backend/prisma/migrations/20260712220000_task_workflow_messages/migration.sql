ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'TASK_PAUSED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'HELP_REQUEST';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'MANAGER_REPLY';
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

CREATE TYPE "TaskMessageKind" AS ENUM ('PAUSE_REQUEST', 'HELP_REQUEST', 'MANAGER_REPLY');
CREATE TYPE "ManagerDecision" AS ENUM ('CONTINUE', 'STOP');

CREATE TABLE "task_messages" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "taskStepId" TEXT,
    "senderId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "TaskMessageKind" NOT NULL,
    "body" TEXT NOT NULL,
    "decision" "ManagerDecision",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_messages_taskId_createdAt_idx" ON "task_messages"("taskId", "createdAt");
CREATE INDEX "task_messages_senderId_createdAt_idx" ON "task_messages"("senderId", "createdAt");
CREATE INDEX "task_messages_parentId_idx" ON "task_messages"("parentId");

ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
