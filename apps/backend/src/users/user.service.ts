import { ConflictException, Injectable } from '@nestjs/common';
import { RegisterDto } from '../auth/dto/register.dto.js';
import { UserRecord } from './user-record.js';
import { UserRepository } from './user.repository.js';

@Injectable()
export class UserService {
  constructor(private readonly repository: UserRepository) {}

  async createUser(data: RegisterDto & { passwordHash: string }): Promise<UserRecord> {
    const existing = await this.repository.findByEmail(data.email);

    if (existing) {
      throw new ConflictException('User already exists');
    }

    return this.repository.create(data);
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.repository.findByEmail(email);
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.repository.findById(id);
  }
}
