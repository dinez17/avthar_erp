import type { UUID } from '@tiles-erp/shared-types';

export class CreateDepartmentCommand {
  constructor(
    public readonly data: { name: string; description: string | null; isActive: boolean },
    public readonly actorId: UUID,
  ) {}
}
