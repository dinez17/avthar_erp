import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '@tiles-erp/shared';
import type { UUID } from '@tiles-erp/shared-types';
import {
  PORTAL_ACCOUNT_REPOSITORY,
  type PortalAccountRepository,
} from '../domain/portal-account.repository';

/**
 * The gate for every portal read and action. Portal endpoints are not permission-gated —
 * an external user holds none — so access is decided here, by whether the logged-in user
 * holds an active link to the party whose data they are asking for.
 */
@Injectable()
export class PortalAccessService {
  constructor(
    @Inject(PORTAL_ACCOUNT_REPOSITORY) private readonly accounts: PortalAccountRepository,
  ) {}

  async assertSupplierAccess(userId: UUID, supplierId: UUID): Promise<void> {
    if (!(await this.accounts.hasSupplierAccess(userId, supplierId))) {
      throw new ForbiddenError('You do not have access to this supplier');
    }
  }
}
