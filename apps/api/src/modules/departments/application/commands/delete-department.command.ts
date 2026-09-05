import type { UUID } from '@tiles-erp/shared-types';

export class DeleteDepartmentCommand {
  constructor(
    public readonly departmentId: UUID,
    public readonly actorId: UUID,
  ) {}
}
