import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { DatabaseService } from '../database/database.service.js';
import { RegisterDto } from '../auth/dto/register.dto.js';
import { UserRecord } from './user-record.js';

@Injectable()
export class UserRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(data: RegisterDto & { passwordHash: string }): Promise<UserRecord> {
    const user = await this.database.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        role: data.role,
        name: data.name ?? null,
      },
    });

    return this.toRecord(user);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.database.user.findUnique({
      where: {
        email: email.toLowerCase(),
      },
    });

    return user ? this.toRecord(user) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.database.user.findUnique({
      where: {
        id,
      },
    });

    return user ? this.toRecord(user) : null;
  }

  private toRecord(user: User): UserRecord {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      name: user.name,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
