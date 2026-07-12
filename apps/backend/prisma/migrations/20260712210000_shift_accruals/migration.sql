ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ANALYST';

CREATE TYPE "ShiftAccrualStatus" AS ENUM ('ACTIVE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TYPE "OvertimeDecision" AS ENUM ('PENDING', 'APPROVED', 'ADJUSTED', 'REJECTED');

CREATE TABLE "shift_accruals" (
    "id" TEXT NOT NULL,
    "workShiftId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" "ShiftAccrualStatus" NOT NULL DEFAULT 'ACTIVE',
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "standardDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "overtimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "calculatedStandardCoinUnits" INTEGER NOT NULL DEFAULT 0,
    "standardCoinUnits" INTEGER NOT NULL DEFAULT 0,
    "calculatedOvertimeCoinUnits" INTEGER NOT NULL DEFAULT 0,
    "analystFinalOvertimeUnits" INTEGER,
    "overtimeDecision" "OvertimeDecision" NOT NULL DEFAULT 'PENDING',
    "analystComment" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shift_accruals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shift_accruals_workShiftId_key" ON "shift_accruals"("workShiftId");
CREATE INDEX "shift_accruals_workerId_status_idx" ON "shift_accruals"("workerId", "status");
CREATE INDEX "shift_accruals_status_createdAt_idx" ON "shift_accruals"("status", "createdAt");
CREATE INDEX "shift_accruals_overtimeDecision_createdAt_idx" ON "shift_accruals"("overtimeDecision", "createdAt");

ALTER TABLE "shift_accruals"
ADD CONSTRAINT "shift_accruals_workShiftId_fkey"
FOREIGN KEY ("workShiftId") REFERENCES "work_shifts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
