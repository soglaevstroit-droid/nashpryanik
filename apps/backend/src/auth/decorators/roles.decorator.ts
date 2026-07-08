import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const rolesMetadataKey = 'roles';

export function Roles(...roles: Role[]) {
  return SetMetadata(rolesMetadataKey, roles);
}
