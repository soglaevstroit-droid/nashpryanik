ALTER TABLE "tasks"
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "completedWorkShiftId" TEXT;

CREATE INDEX "tasks_completedWorkShiftId_idx" ON "tasks"("completedWorkShiftId");

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_completedWorkShiftId_fkey"
FOREIGN KEY ("completedWorkShiftId") REFERENCES "work_shifts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
