import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UploadedArtifactFile } from '../artifacts/uploaded-artifact-file.js';
import { ShiftPhotoActionDto } from './dto/shift-photo-action.dto.js';
import { WorkShiftPhotoActionResult } from './work-shift.service.js';
import { WorkShiftRecord } from './work-shift-record.js';
import { WorkShiftService } from './work-shift.service.js';

@Controller('api/v1/work-shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkShiftController {
  constructor(private readonly workShifts: WorkShiftService) {}

  @Post('start')
  @Roles('CREATOR', 'DIRECTOR')
  @Header('Deprecation', 'true')
  @Header('Warning', '299 - "Deprecated endpoint; use start-with-photo"')
  startShift(@CurrentUser() user: AuthUser): Promise<WorkShiftRecord> {
    return this.workShifts.startShift(user);
  }

  @Post('finish')
  @Roles('CREATOR', 'DIRECTOR')
  @Header('Deprecation', 'true')
  @Header('Warning', '299 - "Deprecated endpoint; use finish-with-photo"')
  finishShift(@CurrentUser() user: AuthUser): Promise<WorkShiftRecord> {
    return this.workShifts.finishShift(user);
  }

  @Post('start-with-photo')
  @Roles('WORKER')
  @UseInterceptors(FileInterceptor('file'))
  startShiftWithPhoto(
    @CurrentUser() user: AuthUser,
    @Body() dto: ShiftPhotoActionDto,
    @UploadedFile() file: UploadedArtifactFile,
  ): Promise<WorkShiftPhotoActionResult> {
    return this.workShifts.startShiftWithPhoto(user, dto, file);
  }

  @Post('finish-with-photo')
  @Roles('WORKER')
  @UseInterceptors(FileInterceptor('file'))
  finishShiftWithPhoto(
    @CurrentUser() user: AuthUser,
    @Body() dto: ShiftPhotoActionDto,
    @UploadedFile() file: UploadedArtifactFile,
  ): Promise<WorkShiftPhotoActionResult> {
    return this.workShifts.finishShiftWithPhoto(user, dto, file);
  }

  @Get('current')
  async getCurrentShift(@CurrentUser() user: AuthUser): Promise<{ shift: WorkShiftRecord | null }> {
    return {
      shift: await this.workShifts.getCurrentShift(user),
    };
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser): Promise<WorkShiftRecord[]> {
    return this.workShifts.history(user);
  }
}
