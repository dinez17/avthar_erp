import type { UUID } from '@tiles-erp/shared-types';

export class GetUserQuery {
  constructor(public readonly userId: UUID) {}
}
