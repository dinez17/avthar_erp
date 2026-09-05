import type { UUID } from '@tiles-erp/shared-types';

export class DeleteRoleCommand {
  constructor(
    public readonly roleId: UUID,
    public readonly actorId: UUID,
  ) {}
}
