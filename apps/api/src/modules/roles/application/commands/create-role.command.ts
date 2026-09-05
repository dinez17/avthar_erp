import type { UUID } from '@tiles-erp/shared-types';

export class CreateRoleCommand {
  constructor(
    public readonly data: {
      name: string;
      description: string | null;
      permissionCodes: string[];
      isSalesRole: boolean;
    },
    public readonly actorId: UUID,
  ) {}
}
