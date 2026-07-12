import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { OvertimeDecision } from '@prisma/client';
import { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ShiftAccrualService } from './shift-accrual.service.js';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShiftAccrualController {
  constructor(private readonly accruals: ShiftAccrualService) {}

  @Get('worker/summary')
  @Roles('WORKER')
  summary(@CurrentUser() user: AuthUser) {
    return this.accruals.getWorkerSummary(user);
  }

  @Get('finance/accruals/pending')
  @Roles('FINANCE')
  pending(@CurrentUser() user: AuthUser) {
    return this.accruals.listPendingForFinance(user);
  }

  @Patch('finance/accruals/:id/approve')
  @Roles('FINANCE')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accruals.approveStandard(user, id);
  }

  @Patch('finance/accruals/:id/reject')
  @Roles('FINANCE')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.accruals.rejectStandard(user, id, body.reason ?? '');
  }

  @Get('analyst/accruals/overtime')
  @Roles('ANALYST')
  overtime(@CurrentUser() user: AuthUser) {
    return this.accruals.listOvertimeForAnalyst(user);
  }

  @Patch('analyst/accruals/:id/overtime-review')
  @Roles('ANALYST')
  reviewOvertime(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: { decision: OvertimeDecision; finalCoinUnits?: number; comment?: string },
  ) {
    return this.accruals.reviewOvertime(user, id, body);
  }
}
