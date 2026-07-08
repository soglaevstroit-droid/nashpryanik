import { Role } from '@prisma/client';

export const roles = [
  'CREATOR',
  'DIRECTOR',
  'FINANCE',
  'FOREMAN',
  'WORKER',
  'PARTNER',
] as const satisfies readonly Role[];

const roleSet = new Set<string>(roles);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && roleSet.has(value);
}
