import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { EventService } from '../events/event.service.js';
import { isRole } from '../roles/roles.js';
import { PublicUser, toPublicUser, UserRecord } from '../users/user-record.js';
import { UserService } from '../users/user.service.js';
import { AuthUser } from './auth-user.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtService } from './jwt.service.js';
import { PasswordService } from './password.service.js';

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly events: EventService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    this.assertRegisterDto(dto);

    const user = await this.users.createUser({
      ...dto,
      email: dto.email.toLowerCase(),
      passwordHash: this.passwords.hashPassword(dto.password),
    });
    await this.events.createEvent({
      type: 'USER_CREATED',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      payload: {
        email: user.email,
        role: user.role,
      },
      metadata: {
        source: 'auth-foundation',
      },
    });

    return this.createAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    this.assertLoginDto(dto);

    const user = await this.users.findByEmail(dto.email);

    if (
      !user ||
      !user.isActive ||
      !this.passwords.verifyPassword(dto.password, user.passwordHash)
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.events.createEvent({
      type: 'USER_LOGGED_IN',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      payload: {
        email: user.email,
        role: user.role,
      },
      metadata: {
        source: 'auth-foundation',
      },
    });

    return this.createAuthResponse(user);
  }

  async getMe(user: AuthUser): Promise<PublicUser> {
    const record = await this.users.findById(user.id);

    if (!record || !record.isActive) {
      throw new UnauthorizedException('User is not active');
    }

    return toPublicUser(record);
  }

  private createAuthResponse(user: UserRecord): AuthResponse {
    return {
      accessToken: this.jwt.signAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
      }),
      user: toPublicUser(user),
    };
  }

  private assertRegisterDto(dto: RegisterDto): void {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Registration body is required');
    }

    assertEmail(dto.email);
    assertPassword(dto.password);

    if (!isRole(dto.role)) {
      throw new BadRequestException('Unknown role');
    }

    if (dto.name !== undefined && dto.name !== null && typeof dto.name !== 'string') {
      throw new BadRequestException('Name must be a string or null');
    }
  }

  private assertLoginDto(dto: LoginDto): void {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Login body is required');
    }

    assertEmail(dto.email);

    if (typeof dto.password !== 'string' || dto.password.length === 0) {
      throw new BadRequestException('Password is required');
    }
  }
}

function assertEmail(value: unknown): void {
  if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new BadRequestException('Valid email is required');
  }
}

function assertPassword(value: unknown): void {
  if (typeof value !== 'string' || value.length < 8) {
    throw new BadRequestException('Password must contain at least 8 characters');
  }
}
