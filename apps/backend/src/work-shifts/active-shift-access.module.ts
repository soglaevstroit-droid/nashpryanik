import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ActiveShiftAccessService } from './active-shift-access.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [ActiveShiftAccessService],
  exports: [ActiveShiftAccessService],
})
export class ActiveShiftAccessModule {}
