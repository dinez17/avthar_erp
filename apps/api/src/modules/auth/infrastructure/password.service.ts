import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

/** Password hashing and verification using bcrypt. */
@Injectable()
export class PasswordService {
  private readonly rounds = 12;

  hash(plain: string): Promise<string> {
    return hash(plain, this.rounds);
  }

  verify(plain: string, passwordHash: string): Promise<boolean> {
    return compare(plain, passwordHash);
  }
}
