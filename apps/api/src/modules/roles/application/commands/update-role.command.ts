import type { UUID } from '@tiles-erp/shared-types';

export class UpdateRoleCommand {
  constructor(
    public readonly roleId: UUID,
    public readonly data: {
      name?: string;
      description?: string | null;
      permissionCodes?: string[];
      isSalesRole?: boolean;
      version: number;
    },
    public readonly actorId: UUID,
  ) {}
}
