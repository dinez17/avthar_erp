import type { UUID } from '@tiles-erp/shared-types';
import type { AuthUser } from './user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/** Port for reading authentication users. Implemented in the infrastructure layer. */
export interface UserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: UUID): Promise<AuthUser | null>;
  updatePassword(id: UUID, passwordHash: string): Promise<void>;
}
