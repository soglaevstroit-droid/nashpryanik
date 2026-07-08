import { Role } from '@prisma/client';

export interface RegisterDto {
  email: string;
  password: string;
  role: Role;
  name?: string | null;
}
