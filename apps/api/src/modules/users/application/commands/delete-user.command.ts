import type { UUID } from '@tiles-erp/shared-types';

export class DeleteUserCommand {
  constructor(
    public readonly userId: UUID,
    public readonly actorId: UUID,
  ) {}
}
