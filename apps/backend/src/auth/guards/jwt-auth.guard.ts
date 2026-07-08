import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthRequest } from '../auth-user.js';
import { JwtService } from '../jwt.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = readBearerToken(request.headers.authorization);

    request.user = this.jwt.verifyAccessToken(token);

    return true;
  }
}

function readBearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith('Bearer ')) {
    throw new UnauthorizedException('Authorization bearer token is required');
  }

  return authorization.slice('Bearer '.length);
}
