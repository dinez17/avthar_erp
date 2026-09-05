import type { UUID } from '@tiles-erp/shared-types';

export class UpdateDepartmentCommand {
  constructor(
    public readonly departmentId: UUID,
    public readonly data: {
      name?: string;
      description?: string | null;
      isActive?: boolean;
      version: number;
    },
    public readonly actorId: UUID,
  ) {}
}
