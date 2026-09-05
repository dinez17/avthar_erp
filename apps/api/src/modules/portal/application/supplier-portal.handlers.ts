import { Inject } from '@nestjs/common';
import {
  CommandBus,
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  CreatePurchaseOrderInput,
  Paginated,
  PaginationQuery,
  PurchaseOrderItem,
  RaiseSupplierPoInput,
  SupplierPortalBranch,
  SupplierPortalInvoice,
  SupplierPortalOrder,
  SupplierPortalOrderDetail,
  SupplierPortalPayment,
  SupplierPortalPoStockLine,
  SupplierPortalProduct,
  SupplierPortalSummary,
  UUID,
} from '@tiles-erp/shared-types';
import { CreatePurchaseOrderCommand } from '../../purchase/application/purchase-order.handlers';
import {
  SUPPLIER_PORTAL_REPOSITORY,
  type SupplierPortalRepository,
} from '../domain/supplier-portal.repository';
import { PortalAccessService } from './portal-access.service';

export class SupplierSummaryQuery {
  constructor(
    public readonly userId: UUID,
    public readonly supplierId: UUID,
  ) {}
}

export class SupplierOrdersQuery {
  constructor(
    public readonly userId: UUID,
    public readonly supplierId: UUID,
    public readonly pagination: PaginationQuery,
  ) {}
}

export class SupplierOrderDetailQuery {
  constructor(
    public readonly userId: UUID,
    public readonly supplierId: UUID,
    public readonly orderId: UUID,
  ) {}
}

export class SupplierInvoicesQuery {
  constructor(
    public readonly userId: UUID,
    public readonly supplierId: UUID,
    public readonly pagination: PaginationQuery,
  ) {}
}

export class SupplierPaymentsQuery {
  constructor(
    public readonly userId: UUID,
    public readonly supplierId: UUID,
    public readonly pagination: PaginationQuery,
  ) {}
}

export class AcknowledgeOrderCommand {
  constructor(
    public readonly userId: UUID,
    public readonly supplierId: UUID,
    public readonly orderId: UUID,
    public readonly decision: 'ACKNOWLEDGED' | 'QUERIED',
    public readonly note: string | null,
  ) {}
}

export class SupplierProductsQuery {
  constructor(
    public readonly userId: UUID,
    public readonly supplierId: UUID,
  ) {}
}

export class SupplierProductPoStockQuery {
  constructor(
    public readonly userId: UUID,
    public readonly supplierId: UUID,
    public readonly productId: UUID,
  ) {}
}

export class SupplierBranchesQuery {
  constructor(
    public readonly userId: UUID,
    public readonly supplierId: UUID,
  ) {}
}

export class RaiseSupplierPoCommand {
  constructor(
    public readonly userId: UUID,
    public readonly supplierId: UUID,
    public readonly data: RaiseSupplierPoInput,
  ) {}
}

@QueryHandler(SupplierSummaryQuery)
export class SupplierSummaryHandler
  implements IQueryHandler<SupplierSummaryQuery, SupplierPortalSummary>
{
  constructor(
    @Inject(SUPPLIER_PORTAL_REPOSITORY) private readonly portal: SupplierPortalRepository,
    private readonly access: PortalAccessService,
  ) {}

  async execute(query: SupplierSummaryQuery): Promise<SupplierPortalSummary> {
    await this.access.assertSupplierAccess(query.userId, query.supplierId);
    return this.portal.summary(query.supplierId);
  }
}

@QueryHandler(SupplierOrdersQuery)
export class SupplierOrdersHandler
  implements IQueryHandler<SupplierOrdersQuery, Paginated<SupplierPortalOrder>>
{
  constructor(
    @Inject(SUPPLIER_PORTAL_REPOSITORY) private readonly portal: SupplierPortalRepository,
    private readonly access: PortalAccessService,
  ) {}

  async execute(query: SupplierOrdersQuery): Promise<Paginated<SupplierPortalOrder>> {
    await this.access.assertSupplierAccess(query.userId, query.supplierId);
    return this.portal.orders(query.supplierId, query.pagination);
  }
}

@QueryHandler(SupplierOrderDetailQuery)
export class SupplierOrderDetailHandler
  implements IQueryHandler<SupplierOrderDetailQuery, SupplierPortalOrderDetail>
{
  constructor(
    @Inject(SUPPLIER_PORTAL_REPOSITORY) private readonly portal: SupplierPortalRepository,
    private readonly access: PortalAccessService,
  ) {}

  async execute(query: SupplierOrderDetailQuery): Promise<SupplierPortalOrderDetail> {
    await this.access.assertSupplierAccess(query.userId, query.supplierId);
    const order = await this.portal.orderDetail(query.supplierId, query.orderId);
    if (!order) throw new NotFoundError('Order not found');
    return order;
  }
}

@QueryHandler(SupplierInvoicesQuery)
export class SupplierInvoicesHandler
  implements IQueryHandler<SupplierInvoicesQuery, Paginated<SupplierPortalInvoice>>
{
  constructor(
    @Inject(SUPPLIER_PORTAL_REPOSITORY) private readonly portal: SupplierPortalRepository,
    private readonly access: PortalAccessService,
  ) {}

  async execute(query: SupplierInvoicesQuery): Promise<Paginated<SupplierPortalInvoice>> {
    await this.access.assertSupplierAccess(query.userId, query.supplierId);
    return this.portal.invoices(query.supplierId, query.pagination);
  }
}

@QueryHandler(SupplierPaymentsQuery)
export class SupplierPaymentsHandler
  implements IQueryHandler<SupplierPaymentsQuery, Paginated<SupplierPortalPayment>>
{
  constructor(
    @Inject(SUPPLIER_PORTAL_REPOSITORY) private readonly portal: SupplierPortalRepository,
    private readonly access: PortalAccessService,
  ) {}

  async execute(query: SupplierPaymentsQuery): Promise<Paginated<SupplierPortalPayment>> {
    await this.access.assertSupplierAccess(query.userId, query.supplierId);
    return this.portal.payments(query.supplierId, query.pagination);
  }
}

@CommandHandler(AcknowledgeOrderCommand)
export class AcknowledgeOrderHandler
  implements ICommandHandler<AcknowledgeOrderCommand, SupplierPortalOrder>
{
  constructor(
    @Inject(SUPPLIER_PORTAL_REPOSITORY) private readonly portal: SupplierPortalRepository,
    private readonly access: PortalAccessService,
  ) {}

  async execute(command: AcknowledgeOrderCommand): Promise<SupplierPortalOrder> {
    await this.access.assertSupplierAccess(command.userId, command.supplierId);
    if (command.decision === 'QUERIED' && !command.note?.trim()) {
      throw new ValidationError('Add a note describing the query');
    }
    const result = await this.portal.acknowledgeOrder(
      command.supplierId,
      command.orderId,
      command.decision,
      command.note?.trim() || null,
      command.userId,
    );
    if (result === 'NOT_FOUND') throw new NotFoundError('Order not found');
    if (result === 'NOT_ALLOWED') {
      throw new ValidationError('This order can no longer be acknowledged');
    }
    return result;
  }
}

@QueryHandler(SupplierProductsQuery)
export class SupplierProductsHandler
  implements IQueryHandler<SupplierProductsQuery, SupplierPortalProduct[]>
{
  constructor(
    @Inject(SUPPLIER_PORTAL_REPOSITORY) private readonly portal: SupplierPortalRepository,
    private readonly access: PortalAccessService,
  ) {}

  async execute(query: SupplierProductsQuery): Promise<SupplierPortalProduct[]> {
    await this.access.assertSupplierAccess(query.userId, query.supplierId);
    return this.portal.products(query.supplierId);
  }
}

@QueryHandler(SupplierProductPoStockQuery)
export class SupplierProductPoStockHandler
  implements IQueryHandler<SupplierProductPoStockQuery, SupplierPortalPoStockLine[]>
{
  constructor(
    @Inject(SUPPLIER_PORTAL_REPOSITORY) private readonly portal: SupplierPortalRepository,
    private readonly access: PortalAccessService,
  ) {}

  async execute(query: SupplierProductPoStockQuery): Promise<SupplierPortalPoStockLine[]> {
    await this.access.assertSupplierAccess(query.userId, query.supplierId);
    return this.portal.productPoStock(query.supplierId, query.productId);
  }
}

@QueryHandler(SupplierBranchesQuery)
export class SupplierBranchesHandler
  implements IQueryHandler<SupplierBranchesQuery, SupplierPortalBranch[]>
{
  constructor(
    @Inject(SUPPLIER_PORTAL_REPOSITORY) private readonly portal: SupplierPortalRepository,
    private readonly access: PortalAccessService,
  ) {}

  async execute(query: SupplierBranchesQuery): Promise<SupplierPortalBranch[]> {
    await this.access.assertSupplierAccess(query.userId, query.supplierId);
    return this.portal.branches();
  }
}

@CommandHandler(RaiseSupplierPoCommand)
export class RaiseSupplierPoHandler
  implements ICommandHandler<RaiseSupplierPoCommand, PurchaseOrderItem>
{
  constructor(
    private readonly commandBus: CommandBus,
    private readonly access: PortalAccessService,
  ) {}

  async execute(command: RaiseSupplierPoCommand): Promise<PurchaseOrderItem> {
    await this.access.assertSupplierAccess(command.userId, command.supplierId);
    const { data } = command;
    if (!data.branchId) throw new ValidationError('Choose a branch');
    if (data.lines.length === 0) throw new ValidationError('Add at least one product');

    // The supplier's own id is forced on — a portal user can only raise orders for
    // themselves — and the order is created through the existing purchase desk as a DRAFT
    // for the company to review and approve.
    const input: CreatePurchaseOrderInput = {
      supplierId: command.supplierId,
      branchId: data.branchId,
      expectedDate: data.expectedDate,
      remarks: data.remarks,
      lines: data.lines.map((line) => ({
        productId: line.productId,
        qtyBoxes: line.boxes,
        rate: line.rate,
        gstRate: line.gstRate,
      })),
    };
    return this.commandBus.execute<CreatePurchaseOrderCommand, PurchaseOrderItem>(
      new CreatePurchaseOrderCommand(input, command.userId),
    );
  }
}
