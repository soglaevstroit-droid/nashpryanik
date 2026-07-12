CREATE TABLE "construction_objects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "construction_objects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "construction_objects_slug_key" ON "construction_objects"("slug");
CREATE INDEX "construction_objects_isActive_sortOrder_idx" ON "construction_objects"("isActive", "sortOrder");

ALTER TABLE "tasks" ADD COLUMN "objectId" TEXT;
ALTER TABLE "events" ADD COLUMN "objectId" TEXT,
ADD COLUMN "taskId" TEXT,
ADD COLUMN "taskStepId" TEXT,
ADD COLUMN "workShiftId" TEXT,
ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "artifacts" ADD COLUMN "workShiftId" TEXT;

CREATE INDEX "tasks_objectId_idx" ON "tasks"("objectId");
CREATE INDEX "tasks_assigneeId_status_idx" ON "tasks"("assigneeId", "status");
CREATE INDEX "events_actorId_createdAt_id_idx" ON "events"("actorId", "createdAt", "id");
CREATE INDEX "events_taskId_idx" ON "events"("taskId");
CREATE INDEX "events_workShiftId_idx" ON "events"("workShiftId");
CREATE UNIQUE INDEX "events_idempotencyKey_key" ON "events"("idempotencyKey");
CREATE INDEX "artifacts_workShiftId_idx" ON "artifacts"("workShiftId");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_objectId_fkey"
FOREIGN KEY ("objectId") REFERENCES "construction_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_steps" ADD CONSTRAINT "task_steps_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
