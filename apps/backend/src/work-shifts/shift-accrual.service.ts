import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OvertimeDecision, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth-user.js';
import { DatabaseService } from '../database/database.service.js';
import { WorkShiftRecord } from './work-shift-record.js';
import {
  COIN_UNITS_PER_SECOND,
  DAILY_STANDARD_LIMIT_COIN_UNITS,
  calculateActiveCoinUnits,
  calculateFinishedShift,
} from './coin-policy.js';

@Injectable()
export class ShiftAccrualService {
  constructor(private readonly database: DatabaseService) {}

  createActive(
    workerId: string,
    workShiftId: string,
    client: Prisma.TransactionClient = this.database,
  ) {
    return client.shiftAccrual.create({ data: { workerId, workShiftId, status: 'ACTIVE' } });
  }

  finishShift(shift: WorkShiftRecord, client: Prisma.TransactionClient = this.database) {
    if (!shift.finishedAt) throw new BadRequestException('Finished shift must have finishedAt');
    const calculation = calculateFinishedShift(shift.startedAt, shift.finishedAt);
    return client.shiftAccrual.upsert({
      where: { workShiftId: shift.id },
      update: { ...calculation, status: 'PENDING_APPROVAL' },
      create: {
        workerId: shift.userId,
        workShiftId: shift.id,
        ...calculation,
        status: 'PENDING_APPROVAL',
      },
    });
  }

  async getWorkerSummary(user: AuthUser, now: Date = new Date()) {
    const [activeShift, userRecord, latestShift, approved, pending] = await Promise.all([
      this.database.workShift.findFirst({
        where: { userId: user.id, status: 'ACTIVE' },
        orderBy: { startedAt: 'desc' },
      }),
      this.database.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { openingBalanceCoinUnits: true },
      }),
      this.database.workShift.findFirst({
        where: { userId: user.id },
        orderBy: { startedAt: 'desc' },
      }),
      this.database.shiftAccrual.aggregate({
        where: { workerId: user.id, status: 'APPROVED' },
        _sum: { standardCoinUnits: true },
      }),
      this.database.shiftAccrual.aggregate({
        where: { workerId: user.id, status: 'PENDING_APPROVAL' },
        _sum: { calculatedStandardCoinUnits: true },
      }),
    ]);
    const active = activeShift ? calculateActiveCoinUnits(activeShift.startedAt, now) : null;
    return {
      shift: activeShift
        ? {
            id: activeShift.id,
            status: activeShift.status,
            startedAt: activeShift.startedAt,
            currentEstimatedCoinUnits: active?.standardCoinUnits ?? 0,
            currentOvertimeCoinUnits: active?.overtimeCoinUnits ?? 0,
          }
        : {
            id: latestShift?.id ?? null,
            status: latestShift?.status ?? 'NOT_STARTED',
            startedAt: null,
            currentEstimatedCoinUnits: 0,
            currentOvertimeCoinUnits: 0,
          },
      coins: {
        approvedBalanceCoinUnits:
          userRecord.openingBalanceCoinUnits + (approved._sum.standardCoinUnits ?? 0),
        pendingCoinUnits: pending._sum.calculatedStandardCoinUnits ?? 0,
      },
      policy: {
        coinUnitsPerSecond: COIN_UNITS_PER_SECOND,
        dailyStandardLimitCoinUnits: DAILY_STANDARD_LIMIT_COIN_UNITS,
      },
    };
  }

  async approveStandard(user: AuthUser, id: string) {
    assertRole(user, 'FINANCE');
    return this.database.$transaction(async (client) => {
      const result = await client.shiftAccrual.updateMany({
        where: { id, status: 'PENDING_APPROVAL' },
        data: { status: 'APPROVED', approvedByUserId: user.id, approvedAt: new Date() },
      });
      if (result.count !== 1) throw new ConflictException('Accrual is not pending approval');
      return client.shiftAccrual.findUniqueOrThrow({ where: { id } });
    });
  }

  async rejectStandard(user: AuthUser, id: string, reason: string) {
    assertRole(user, 'FINANCE');
    if (!reason.trim()) throw new BadRequestException('Rejection reason is required');
    return this.database.$transaction(async (client) => {
      const result = await client.shiftAccrual.updateMany({
        where: { id, status: 'PENDING_APPROVAL' },
        data: { status: 'REJECTED', rejectionReason: reason.trim() },
      });
      if (result.count !== 1) throw new ConflictException('Accrual is not pending approval');
      return client.shiftAccrual.findUniqueOrThrow({ where: { id } });
    });
  }

  async reviewOvertime(
    user: AuthUser,
    id: string,
    input: { decision: OvertimeDecision; finalCoinUnits?: number; comment?: string },
  ) {
    assertRole(user, 'ANALYST');
    if (!['APPROVED', 'ADJUSTED', 'REJECTED'].includes(input.decision))
      throw new BadRequestException('Invalid overtime decision');
    const accrual = await this.database.shiftAccrual.findUnique({ where: { id } });
    if (!accrual) throw new NotFoundException('Accrual not found');
    if (accrual.overtimeDecision !== 'PENDING')
      throw new ConflictException('Overtime has already been reviewed');
    const finalCoinUnits = resolveFinalOvertime(input, accrual.calculatedOvertimeCoinUnits);
    return this.database.shiftAccrual.update({
      where: { id },
      data: {
        overtimeDecision: input.decision,
        analystFinalOvertimeUnits: finalCoinUnits,
        analystComment: input.comment?.trim() || null,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
      },
    });
  }

  listPendingForFinance(user: AuthUser) {
    assertRole(user, 'FINANCE');
    return this.database.shiftAccrual.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listOvertimeForAnalyst(user: AuthUser) {
    assertRole(user, 'ANALYST');
    const accruals = await this.database.shiftAccrual.findMany({
      where: { overtimeSeconds: { gt: 0 }, overtimeDecision: 'PENDING' },
      include: { workShift: { include: { photos: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      accruals.map(async (accrual) => ({
        ...accrual,
        events: await this.database.event.findMany({
          where: {
            actorId: accrual.workerId,
            createdAt: {
              gte: accrual.workShift.startedAt,
              lte: accrual.workShift.finishedAt ?? new Date(),
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { artifacts: { select: { id: true, mimeType: true } } },
        }),
      })),
    );
  }
}

function resolveFinalOvertime(
  input: { decision: OvertimeDecision; finalCoinUnits?: number },
  calculated: number,
): number {
  if (input.decision === 'PENDING') throw new BadRequestException('A final decision is required');
  if (input.decision === 'REJECTED') return 0;
  const value = input.decision === 'APPROVED' ? calculated : input.finalCoinUnits;
  if (!Number.isSafeInteger(value) || value! < 0)
    throw new BadRequestException('Final overtime coin units must be a non-negative integer');
  return value!;
}

function assertRole(user: AuthUser, role: 'FINANCE' | 'ANALYST'): void {
  if (user.role !== role) throw new ForbiddenException(`${role} role is required`);
}
