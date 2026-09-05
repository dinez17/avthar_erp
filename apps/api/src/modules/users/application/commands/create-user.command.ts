import type { UUID } from '@tiles-erp/shared-types';

export class CreateUserCommand {
  constructor(
    public readonly data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      isActive: boolean;
      roleIds: UUID[];
      branchIds: UUID[];
      departmentIds: UUID[];
    },
    public readonly actorId: UUID,
  ) {}
}
