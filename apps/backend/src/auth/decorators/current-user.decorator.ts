import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthRequest } from '../auth-user.js';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthRequest>();

  return request.user;
});
