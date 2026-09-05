import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PasswordService } from '../auth/infrastructure/password.service';
import { PORTAL_ACCOUNT_REPOSITORY } from './domain/portal-account.repository';
import { SUPPLIER_PORTAL_REPOSITORY } from './domain/supplier-portal.repository';
import { PrismaPortalAccountRepository } from './infrastructure/prisma-portal-account.repository';
import { PrismaSupplierPortalRepository } from './infrastructure/prisma-supplier-portal.repository';
import { PortalAccessService } from './application/portal-access.service';
import { PortalAccountController } from './presentation/portal-account.controller';
import { PortalController } from './presentation/portal.controller';
import {
  CreatePortalAccountHandler,
  DeletePortalAccountHandler,
  GetPortalMeHandler,
  ListPortalAccountsHandler,
  SetPortalAccountActiveHandler,
} from './application/portal-account.handlers';
import {
  AcknowledgeOrderHandler,
  RaiseSupplierPoHandler,
  SupplierBranchesHandler,
  SupplierInvoicesHandler,
  SupplierOrderDetailHandler,
  SupplierOrdersHandler,
  SupplierPaymentsHandler,
  SupplierProductPoStockHandler,
  SupplierProductsHandler,
  SupplierSummaryHandler,
} from './application/supplier-portal.handlers';

const handlers = [
  GetPortalMeHandler,
  ListPortalAccountsHandler,
  CreatePortalAccountHandler,
  SetPortalAccountActiveHandler,
  DeletePortalAccountHandler,
  SupplierSummaryHandler,
  SupplierOrdersHandler,
  SupplierOrderDetailHandler,
  SupplierInvoicesHandler,
  SupplierPaymentsHandler,
  AcknowledgeOrderHandler,
  SupplierProductsHandler,
  SupplierProductPoStockHandler,
  SupplierBranchesHandler,
  RaiseSupplierPoHandler,
];

/**
 * Portals: external supplier/customer logins. Admin-side provisioning is permission-gated;
 * the portal reads and the acknowledgement are scoped by PortalAccessService to the parties
 * the logged-in user is linked to. PasswordService is provided here for minting new logins.
 */
@Module({
  imports: [CqrsModule],
  controllers: [PortalAccountController, PortalController],
  providers: [
    { provide: PORTAL_ACCOUNT_REPOSITORY, useClass: PrismaPortalAccountRepository },
    { provide: SUPPLIER_PORTAL_REPOSITORY, useClass: PrismaSupplierPortalRepository },
    PortalAccessService,
    PasswordService,
    ...handlers,
  ],
})
export class PortalModule {}
