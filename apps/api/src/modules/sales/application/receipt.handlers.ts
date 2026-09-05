import { Inject } from '@nestjs/common';
import { CommandHandler, QueryHandler, type ICommandHandler, type IQueryHandler } from '@nestjs/cqrs';
import { exceeds, NotFoundError, settleOldestFirst, ValidationError } from '@tiles-erp/shared';
import type {
  CreateReceiptInput,
  CustomerDueSummary,
  CustomerLedger,
  CustomerReceiptItem,
  OpenInvoiceItem,
  OutstandingRow,
  Paginated,
  PaginationQuery,
  ReceiptPrintData,
  UpdateReceiptInput,
  UUID,
} from '@tiles-erp/shared-types';
import {
  RECEIPT_REPOSITORY,
  type ReceiptFilter,
  type ReceiptRepository,
  type ReceiptWriteData,
  type ResolvedAllocation,
  type ResolvedPayment,
} from '../domain/receipt.repository';

const round2 = (value: number): number => Math.round(value * 100) / 100;

export class ListReceiptsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: ReceiptFilter,
  ) {}
}

export class GetReceiptQuery {
  constructor(public readonly id: UUID) {}
}

export class ReceiptPrintQuery {
  constructor(public readonly id: UUID) {}
}

export class CustomerDueQuery {
  constructor(
    public readonly customerId: UUID,
    public readonly branchId?: UUID,
  ) {}
}

export class OpenInvoicesQuery {
  constructor(
    public readonly customerId: UUID,
    public readonly branchId?: UUID,
  ) {}
}

export class CustomerLedgerQuery {
  constructor(
    public readonly customerId: UUID,
    public readonly from?: string,
    public readonly to?: string,
  ) {}
}

export class OutstandingQuery {
  constructor(public readonly branchId?: UUID) {}
}

export class CreateReceiptCommand {
  constructor(
    public readonly data: CreateReceiptInput,
    public readonly actorId: UUID,
  ) {}
}

export class UpdateReceiptCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateReceiptInput,
    public readonly actorId: UUID,
  ) {}
}

export class PostReceiptCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly actorId: UUID,
  ) {}
}

export class CancelReceiptCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly reason: string,
    public readonly actorId: UUID,
  ) {}
}

export class DeleteReceiptCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

/**
 * Spreads a payment over the open invoices, oldest first — the way a counter settles a
 * customer's account when they simply hand over money. Anything left when every invoice
 * is clear stays on account as an advance.
 *
 * The spreading itself is the shared `settleOldestFirst`, which the payables side uses
 * too; all this adds is naming the target an invoice.
 */
export function allocateOldestFirst(
  amount: number,
  openInvoices: OpenInvoiceItem[],
): ResolvedAllocation[] {
  return settleOldestFirst(amount, openInvoices).settlements.map((settlement) => ({
    salesInvoiceId: settlement.target.salesInvoiceId,
    amount: settlement.amount,
  }));
}

async function buildReceiptData(
  receipts: ReceiptRepository,
  input: CreateReceiptInput,
): Promise<ReceiptWriteData> {
  const payments: ResolvedPayment[] = (input.payments ?? [])
    .filter((payment) => payment.amount > 0)
    .map((payment) => ({
      mode: payment.mode,
      amount: round2(payment.amount),
      referenceNo: payment.referenceNo?.trim() || null,
      accountId: payment.accountId ?? null,
      bankName: payment.bankName?.trim() || null,
    }));
  if (payments.length === 0) throw new ValidationError('Enter the amount received');

  // The receipt total is whatever the tenders add up to; it is never typed separately.
  const amount = round2(payments.reduce((sum, payment) => sum + payment.amount, 0));
  const mode = payments.length === 1 ? payments[0]!.mode : 'MIXED';

  await receipts.assertCustomer(input.customerId, input.branchId);

  const open = await receipts.openInvoices(input.customerId, input.branchId);
  const openById = new Map(open.map((invoice) => [invoice.salesInvoiceId, invoice]));

  let allocations: ResolvedAllocation[];
  if (input.allocations && input.allocations.length > 0) {
    allocations = input.allocations
      .filter((allocation) => allocation.amount > 0)
      .map((allocation) => {
        const invoice = openById.get(allocation.salesInvoiceId);
        if (!invoice) {
          throw new ValidationError('One or more invoices are not open for this customer');
        }
        if (exceeds(allocation.amount, invoice.balanceAmount)) {
          throw new ValidationError(
            `${invoice.invoiceNumber} only has ${invoice.balanceAmount} outstanding`,
          );
        }
        return { salesInvoiceId: allocation.salesInvoiceId, amount: round2(allocation.amount) };
      });
  } else {
    allocations = allocateOldestFirst(amount, open);
  }

  const allocatedAmount = round2(
    allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
  );
  if (exceeds(allocatedAmount, amount)) {
    throw new ValidationError('The allocations add up to more than the amount received');
  }

  return {
    customerId: input.customerId,
    branchId: input.branchId,
    receiptDate: input.receiptDate ? new Date(input.receiptDate) : new Date(),
    mode,
    payments,
    amount,
    allocatedAmount,
    remarks: input.remarks?.trim() || null,
    allocations,
  };
}

@QueryHandler(ListReceiptsQuery)
export class ListReceiptsHandler
  implements IQueryHandler<ListReceiptsQuery, Paginated<CustomerReceiptItem>>
{
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  execute(query: ListReceiptsQuery): Promise<Paginated<CustomerReceiptItem>> {
    return this.receipts.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetReceiptQuery)
export class GetReceiptHandler implements IQueryHandler<GetReceiptQuery, CustomerReceiptItem> {
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  async execute(query: GetReceiptQuery): Promise<CustomerReceiptItem> {
    const receipt = await this.receipts.findById(query.id);
    if (!receipt) throw new NotFoundError('Receipt not found');
    return receipt;
  }
}

@QueryHandler(CustomerDueQuery)
export class CustomerDueHandler implements IQueryHandler<CustomerDueQuery, CustomerDueSummary> {
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  execute(query: CustomerDueQuery): Promise<CustomerDueSummary> {
    return this.receipts.dueSummary(query.customerId, query.branchId);
  }
}

@QueryHandler(OpenInvoicesQuery)
export class OpenInvoicesHandler implements IQueryHandler<OpenInvoicesQuery, OpenInvoiceItem[]> {
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  execute(query: OpenInvoicesQuery): Promise<OpenInvoiceItem[]> {
    return this.receipts.openInvoices(query.customerId, query.branchId);
  }
}

@QueryHandler(CustomerLedgerQuery)
export class CustomerLedgerHandler implements IQueryHandler<CustomerLedgerQuery, CustomerLedger> {
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  execute(query: CustomerLedgerQuery): Promise<CustomerLedger> {
    return this.receipts.ledger(
      query.customerId,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }
}

@QueryHandler(OutstandingQuery)
export class OutstandingHandler implements IQueryHandler<OutstandingQuery, OutstandingRow[]> {
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  execute(query: OutstandingQuery): Promise<OutstandingRow[]> {
    return this.receipts.outstanding(query.branchId);
  }
}

@CommandHandler(CreateReceiptCommand)
export class CreateReceiptHandler
  implements ICommandHandler<CreateReceiptCommand, CustomerReceiptItem>
{
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  async execute(command: CreateReceiptCommand): Promise<CustomerReceiptItem> {
    const data = await buildReceiptData(this.receipts, command.data);
    const number = await this.receipts.nextReceiptNumber(data.branchId);
    return this.receipts.create(number, data, command.actorId);
  }
}

@CommandHandler(UpdateReceiptCommand)
export class UpdateReceiptHandler
  implements ICommandHandler<UpdateReceiptCommand, CustomerReceiptItem>
{
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  async execute(command: UpdateReceiptCommand): Promise<CustomerReceiptItem> {
    const existing = await this.receipts.findById(command.id);
    if (!existing) throw new NotFoundError('Receipt not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError(
        `Only draft receipts can be edited (this one is ${existing.status})`,
      );
    }

    const merged: CreateReceiptInput = {
      customerId: command.data.customerId ?? existing.customerId,
      branchId: command.data.branchId ?? existing.branchId,
      receiptDate: command.data.receiptDate ?? existing.receiptDate,
      payments:
        command.data.payments ??
        (existing.payments ?? []).map((payment) => ({
          mode: payment.mode,
          amount: payment.amount,
          referenceNo: payment.referenceNo ?? undefined,
          accountId: payment.accountId ?? undefined,
          bankName: payment.bankName ?? undefined,
        })),
      remarks: command.data.remarks ?? existing.remarks ?? undefined,
      allocations:
        command.data.allocations ??
        (existing.allocations ?? []).map((allocation) => ({
          salesInvoiceId: allocation.salesInvoiceId,
          amount: allocation.amount,
        })),
    };

    const data = await buildReceiptData(this.receipts, merged);
    return this.receipts.update(command.id, command.data.version, data, command.actorId);
  }
}

@CommandHandler(PostReceiptCommand)
export class PostReceiptHandler implements ICommandHandler<PostReceiptCommand, CustomerReceiptItem> {
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  execute(command: PostReceiptCommand): Promise<CustomerReceiptItem> {
    return this.receipts.post(command.id, command.version, command.actorId);
  }
}

@CommandHandler(CancelReceiptCommand)
export class CancelReceiptHandler
  implements ICommandHandler<CancelReceiptCommand, CustomerReceiptItem>
{
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  execute(command: CancelReceiptCommand): Promise<CustomerReceiptItem> {
    const reason = command.reason.trim();
    if (!reason) throw new ValidationError('A cancellation reason is required');
    return this.receipts.cancel(command.id, command.version, reason, command.actorId);
  }
}

@CommandHandler(DeleteReceiptCommand)
export class DeleteReceiptHandler
  implements ICommandHandler<DeleteReceiptCommand, { success: true }>
{
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  async execute(command: DeleteReceiptCommand): Promise<{ success: true }> {
    await this.receipts.softDelete(command.id, command.actorId);
    return { success: true };
  }
}

@QueryHandler(ReceiptPrintQuery)
export class ReceiptPrintHandler implements IQueryHandler<ReceiptPrintQuery, ReceiptPrintData> {
  constructor(@Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository) {}

  async execute(query: ReceiptPrintQuery): Promise<ReceiptPrintData> {
    const data = await this.receipts.printData(query.id);
    if (!data) throw new NotFoundError('Receipt not found');
    return data;
  }
}
