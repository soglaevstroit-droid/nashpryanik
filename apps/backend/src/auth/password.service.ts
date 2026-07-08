import { Injectable } from '@nestjs/common';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const passwordAlgorithm = 'pbkdf2-sha256';
const iterations = 120000;
const keyLength = 32;
const digest = 'sha256';

@Injectable()
export class PasswordService {
  hashPassword(password: string): string {
    const salt = randomBytes(16);
    const hash = pbkdf2Sync(password, salt, iterations, keyLength, digest);

    return [
      passwordAlgorithm,
      iterations,
      salt.toString('base64url'),
      hash.toString('base64url'),
    ].join('$');
  }

  verifyPassword(password: string, storedHash: string): boolean {
    const [algorithm, iterationValue, saltValue, hashValue] = storedHash.split('$');

    if (algorithm !== passwordAlgorithm || !iterationValue || !saltValue || !hashValue) {
      return false;
    }

    const stored = Buffer.from(hashValue, 'base64url');
    const derived = pbkdf2Sync(
      password,
      Buffer.from(saltValue, 'base64url'),
      Number(iterationValue),
      stored.length,
      digest,
    );

    return stored.length === derived.length && timingSafeEqual(stored, derived);
  }
}
