import type { UUID } from '@tiles-erp/shared-types';

export class UpdateUserCommand {
  constructor(
    public readonly userId: UUID,
    public readonly data: {
      firstName?: string;
      lastName?: string;
      isActive?: boolean;
      password?: string;
      roleIds?: UUID[];
      branchIds?: UUID[];
      departmentIds?: UUID[];
      version: number;
    },
    public readonly actorId: UUID,
  ) {}
}
