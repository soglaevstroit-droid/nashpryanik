import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service.js';
import { AuthUser } from './auth-user.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: AuthUser['role'];
  iat: number;
  exp: number;
}

const tokenTtlSeconds = 60 * 60;

@Injectable()
export class JwtService {
  constructor(private readonly config: AppConfigService) {}

  signAccessToken(user: AuthUser): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: issuedAt,
      exp: issuedAt + tokenTtlSeconds,
    };

    const encodedHeader = encodeJson({
      alg: 'HS256',
      typ: 'JWT',
    });
    const encodedPayload = encodeJson(payload);
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  verifyAccessToken(token: string): AuthUser {
    const [encodedHeader, encodedPayload, signature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid access token');
    }

    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);

    if (!safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid access token');
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as JwtPayload;

    if (!payload.sub || !payload.email || !payload.role || !payload.exp) {
      throw new UnauthorizedException('Invalid access token');
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Access token expired');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }

  private sign(value: string): string {
    return createHmac('sha256', this.config.jwtSecret).update(value).digest('base64url');
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
