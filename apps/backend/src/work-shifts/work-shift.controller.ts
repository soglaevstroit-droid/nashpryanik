import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { WorkShiftRecord } from './work-shift-record.js';
import { WorkShiftService } from './work-shift.service.js';

@Controller('api/v1/work-shifts')
@UseGuards(JwtAuthGuard)
export class WorkShiftController {
  constructor(private readonly workShifts: WorkShiftService) {}

  @Post('start')
  startShift(@CurrentUser() user: AuthUser): Promise<WorkShiftRecord> {
    return this.workShifts.startShift(user);
  }

  @Post('finish')
  finishShift(@CurrentUser() user: AuthUser): Promise<WorkShiftRecord> {
    return this.workShifts.finishShift(user);
  }

  @Get('current')
  getCurrentShift(@CurrentUser() user: AuthUser): Promise<WorkShiftRecord | null> {
    return this.workShifts.getCurrentShift(user);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser): Promise<WorkShiftRecord[]> {
    return this.workShifts.history(user);
  }
}
