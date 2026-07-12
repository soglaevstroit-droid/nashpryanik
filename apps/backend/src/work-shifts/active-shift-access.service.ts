import { ConflictException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class ActiveShiftAccessService {
  constructor(private readonly database: DatabaseService) {}

  async assertActiveShift(user: AuthUser): Promise<void> {
    if (user.role !== 'WORKER') return;

    const activeShift = await this.database.workShift.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!activeShift) {
      throw new ConflictException({
        code: 'ACTIVE_SHIFT_REQUIRED',
        message: 'Откройте смену, чтобы работать с задачей',
      });
    }
  }
}
