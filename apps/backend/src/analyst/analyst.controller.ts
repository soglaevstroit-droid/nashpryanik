import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AnalystService } from './analyst.service.js';

@Controller('api/v1/analyst')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ANALYST')
export class AnalystController {
  constructor(private readonly analyst: AnalystService) {}

  @Get('summary')
  summary() {
    return this.analyst.getSummary();
  }

  @Get('workers/live')
  live() {
    return this.analyst.getLiveWorkers();
  }

  @Get('shifts/history')
  history() {
    return this.analyst.getShiftHistory();
  }

  @Get('shifts/:shiftId')
  shift(@Param('shiftId') shiftId: string) {
    return this.analyst.getShift(shiftId);
  }
}
