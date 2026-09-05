import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import {
  exceeds,
  NotFoundError,
  settleOldestFirst,
  ValidationError,
} from '@tiles-erp/shared';
import type {
  CreateSupplierPaymentInput,
  OpenBillItem,
  OpenDebitNoteItem,
  Paginated,
  PaginationQuery,
  PayableRow,
  SupplierDueSummary,
  SupplierLedger,
  SupplierPaymentItem,
  UpdateSupplierPaymentInput,
  UUID,
} from '@tiles-erp/shared-types';
import {
  SUPPLIER_PAYMENT_REPOSITORY,
  type ResolvedBillAllocation,
  type ResolvedDebitNote,
  type ResolvedTender,
  type SupplierPaymentFilter,
  type SupplierPaymentRepository,
  type SupplierPaymentWriteData,
} from '../domain/supplier-payment.repository';

const round2 = (value: number): number => Math.round(value * 100) / 100;

export class ListSupplierPaymentsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: SupplierPaymentFilter,
  ) {}
}

export class GetSupplierPaymentQuery {
  constructor(public readonly id: UUID) {}
}

export class OpenBillsQuery {
  constructor(
    public readonly supplierId: UUID,
    public readonly branchId?: UUID,
  ) {}
}

export class OpenDebitNotesQuery {
  constructor(
    public readonly supplierId: UUID,
    public readonly branchId?: UUID,
  ) {}
}

export class SupplierDueQuery {
  constructor(
    public readonly supplierId: UUID,
    public readonly branchId?: UUID,
  ) {}
}

export class SupplierLedgerQuery {
  constructor(
    public readonly supplierId: UUID,
    public readonly from?: string,
    public readonly to?: string,
  ) {}
}

export class PayablesQuery {
  constructor(public readonly branchId?: UUID) {}
}

export class CreateSupplierPaymentCommand {
  constructor(
    public readonly data: CreateSupplierPaymentInput,
    public readonly actorId: UUID,
  ) {}
}

export class UpdateSupplierPaymentCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateSupplierPaymentInput,
    public readonly actorId: UUID,
  ) {}
}

export class PostSupplierPaymentCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly actorId: UUID,
  ) {}
}

export class CancelSupplierPaymentCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly reason: string,
    public readonly actorId: UUID,
  ) {}
}

export class DeleteSupplierPaymentCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

/**
 * Spreads a payment over the open bills, soonest due first.
 *
 * Payables are settled by due date rather than by bill date, which is where this parts
 * company with a customer receipt: what matters is what falls due next, and a supplier
 * on 60 days can easily have billed you before one on 7 days who needs paying first.
 * The repository returns the list already in that order.
 */
export function allocateByDueDate(
  amount: number,
  openBills: OpenBillItem[],
): ResolvedBillAllocation[] {
  return settleOldestFirst(amount, openBills).settlements.map((settlement) => ({
    purchaseInvoiceId: settlement.target.purchaseInvoiceId,
    amount: settlement.amount,
  }));
}

/** Resolves the debit notes being spent, checking each still has the credit claimed. */
function resolveDebitNotes(
  requested: { purchaseReturnId: UUID; amount: number }[],
  open: OpenDebitNoteItem[],
): ResolvedDebitNote[] {
  const openById = new Map(open.map((note) => [note.purchaseReturnId, note]));
  const seen = new Set<string>();

  return requested
    .filter((note) => note.amount > 0)
    .map((note) => {
      const available = openById.get(note.purchaseReturnId);
      if (!available) {
        throw new ValidationError('One or more debit notes are not open for this supplier');
      }
      if (seen.has(note.purchaseReturnId)) {
        throw new ValidationError('The same debit note is listed twice');
      }
      seen.add(note.purchaseReturnId);
      if (exceeds(note.amount, available.balanceAmount)) {
        throw new ValidationError(
          `${available.returnNumber} only has ${available.balanceAmount} of credit left`,
        );
      }
      return { purchaseReturnId: note.purchaseReturnId, amount: round2(note.amount) };
    });
}

async function buildPaymentData(
  payments: SupplierPaymentRepository,
  input: CreateSupplierPaymentInput,
): Promise<SupplierPaymentWriteData> {
  const tenders: ResolvedTender[] = (input.tenders ?? [])
    .filter((tender) => tender.amount > 0)
    .map((tender) => ({
      mode: tender.mode,
      amount: round2(tender.amount),
      referenceNo: tender.referenceNo?.trim() || null,
      accountId: tender.accountId ?? null,
      bankName: tender.bankName?.trim() || null,
    }));

  await payments.assertSupplier(input.supplierId, input.branchId);

  const openNotes = await payments.openDebitNotes(input.supplierId, input.branchId);
  const debitNotes = resolveDebitNotes(input.debitNotes ?? [], openNotes);

  // The payment total is whatever the tenders add up to, never typed separately.
  const amount = round2(tenders.reduce((sum, tender) => sum + tender.amount, 0));
  const adjustedAmount = round2(debitNotes.reduce((sum, note) => sum + note.amount, 0));
  const settled = round2(amount + adjustedAmount);

  // A payment of nothing settles nothing. Zero cash is fine when credit is being spent,
  // which is the whole point of a debit-note set-off.
  if (settled <= 0) {
    throw new ValidationError('Enter an amount paid, or a debit note to set off');
  }

  const mode = tenders.length === 1 ? tenders[0]!.mode : tenders.length === 0 ? 'BANK' : 'MIXED';

  const open = await payments.openBills(input.supplierId, input.branchId);
  const openById = new Map(open.map((bill) => [bill.purchaseInvoiceId, bill]));

  let allocations: ResolvedBillAllocation[];
  if (input.allocations && input.allocations.length > 0) {
    const seen = new Set<string>();
    allocations = input.allocations
      .filter((allocation) => allocation.amount > 0)
      .map((allocation) => {
        const bill = openById.get(allocation.purchaseInvoiceId);
        if (!bill) {
          throw new ValidationError('One or more bills are not open for this supplier');
        }
        if (seen.has(allocation.purchaseInvoiceId)) {
          throw new ValidationError('The same bill is listed twice');
        }
        seen.add(allocation.purchaseInvoiceId);
        if (exceeds(allocation.amount, bill.balanceAmount)) {
          throw new ValidationError(
            `${bill.supplierInvoiceNo} only has ${bill.balanceAmount} outstanding`,
          );
        }
        return {
          purchaseInvoiceId: allocation.purchaseInvoiceId,
          amount: round2(allocation.amount),
        };
      });
  } else {
    allocations = allocateByDueDate(settled, open);
  }

  const allocatedAmount = round2(
    allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
  );
  if (exceeds(allocatedAmount, settled)) {
    throw new ValidationError(
      'The bills allocated add up to more than the payment is worth. Add a tender, or reduce the allocation.',
    );
  }

  return {
    supplierId: input.supplierId,
    branchId: input.branchId,
    paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
    mode,
    tenders,
    amount,
    adjustedAmount,
    allocatedAmount,
    remarks: input.remarks?.trim() || null,
    allocations,
    debitNotes,
  };
}

@QueryHandler(ListSupplierPaymentsQuery)
export class ListSupplierPaymentsHandler
  implements IQueryHandler<ListSupplierPaymentsQuery, Paginated<SupplierPaymentItem>>
{
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  execute(query: ListSupplierPaymentsQuery): Promise<Paginated<SupplierPaymentItem>> {
    return this.payments.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetSupplierPaymentQuery)
export class GetSupplierPaymentHandler
  implements IQueryHandler<GetSupplierPaymentQuery, SupplierPaymentItem>
{
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  async execute(query: GetSupplierPaymentQuery): Promise<SupplierPaymentItem> {
    const payment = await this.payments.findById(query.id);
    if (!payment) throw new NotFoundError('Payment not found');
    return payment;
  }
}

@QueryHandler(OpenBillsQuery)
export class OpenBillsHandler implements IQueryHandler<OpenBillsQuery, OpenBillItem[]> {
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  execute(query: OpenBillsQuery): Promise<OpenBillItem[]> {
    return this.payments.openBills(query.supplierId, query.branchId);
  }
}

@QueryHandler(OpenDebitNotesQuery)
export class OpenDebitNotesHandler
  implements IQueryHandler<OpenDebitNotesQuery, OpenDebitNoteItem[]>
{
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  execute(query: OpenDebitNotesQuery): Promise<OpenDebitNoteItem[]> {
    return this.payments.openDebitNotes(query.supplierId, query.branchId);
  }
}

@QueryHandler(SupplierDueQuery)
export class SupplierDueHandler implements IQueryHandler<SupplierDueQuery, SupplierDueSummary> {
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  execute(query: SupplierDueQuery): Promise<SupplierDueSummary> {
    return this.payments.dueSummary(query.supplierId, query.branchId);
  }
}

@QueryHandler(SupplierLedgerQuery)
export class SupplierLedgerHandler implements IQueryHandler<SupplierLedgerQuery, SupplierLedger> {
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  execute(query: SupplierLedgerQuery): Promise<SupplierLedger> {
    return this.payments.ledger(
      query.supplierId,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }
}

@QueryHandler(PayablesQuery)
export class PayablesHandler implements IQueryHandler<PayablesQuery, PayableRow[]> {
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  execute(query: PayablesQuery): Promise<PayableRow[]> {
    return this.payments.payables(query.branchId);
  }
}

@CommandHandler(CreateSupplierPaymentCommand)
export class CreateSupplierPaymentHandler
  implements ICommandHandler<CreateSupplierPaymentCommand, SupplierPaymentItem>
{
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  async execute(command: CreateSupplierPaymentCommand): Promise<SupplierPaymentItem> {
    const data = await buildPaymentData(this.payments, command.data);
    const number = await this.payments.nextPaymentNumber(data.branchId);
    return this.payments.create(number, data, command.actorId);
  }
}

@CommandHandler(UpdateSupplierPaymentCommand)
export class UpdateSupplierPaymentHandler
  implements ICommandHandler<UpdateSupplierPaymentCommand, SupplierPaymentItem>
{
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  async execute(command: UpdateSupplierPaymentCommand): Promise<SupplierPaymentItem> {
    const existing = await this.payments.findById(command.id);
    if (!existing) throw new NotFoundError('Payment not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError(
        `Only draft payments can be edited (this one is ${existing.status})`,
      );
    }

    const merged: CreateSupplierPaymentInput = {
      supplierId: command.data.supplierId ?? existing.supplierId,
      branchId: command.data.branchId ?? existing.branchId,
      paymentDate: command.data.paymentDate ?? existing.paymentDate,
      tenders:
        command.data.tenders ??
        (existing.tenders ?? []).map((tender) => ({
          mode: tender.mode,
          amount: tender.amount,
          referenceNo: tender.referenceNo ?? undefined,
          accountId: tender.accountId ?? undefined,
          bankName: tender.bankName ?? undefined,
        })),
      debitNotes:
        command.data.debitNotes ??
        (existing.debitNotes ?? []).map((note) => ({
          purchaseReturnId: note.purchaseReturnId,
          amount: note.amount,
        })),
      remarks: command.data.remarks ?? existing.remarks ?? undefined,
      allocations:
        command.data.allocations ??
        (existing.allocations ?? []).map((allocation) => ({
          purchaseInvoiceId: allocation.purchaseInvoiceId,
          amount: allocation.amount,
        })),
    };

    const data = await buildPaymentData(this.payments, merged);
    return this.payments.update(command.id, command.data.version, data, command.actorId);
  }
}

@CommandHandler(PostSupplierPaymentCommand)
export class PostSupplierPaymentHandler
  implements ICommandHandler<PostSupplierPaymentCommand, SupplierPaymentItem>
{
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  execute(command: PostSupplierPaymentCommand): Promise<SupplierPaymentItem> {
    return this.payments.post(command.id, command.version, command.actorId);
  }
}

@CommandHandler(CancelSupplierPaymentCommand)
export class CancelSupplierPaymentHandler
  implements ICommandHandler<CancelSupplierPaymentCommand, SupplierPaymentItem>
{
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  execute(command: CancelSupplierPaymentCommand): Promise<SupplierPaymentItem> {
    const reason = command.reason.trim();
    if (!reason) throw new ValidationError('A cancellation reason is required');
    return this.payments.cancel(command.id, command.version, reason, command.actorId);
  }
}

@CommandHandler(DeleteSupplierPaymentCommand)
export class DeleteSupplierPaymentHandler
  implements ICommandHandler<DeleteSupplierPaymentCommand, { success: true }>
{
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
  ) {}

  async execute(command: DeleteSupplierPaymentCommand): Promise<{ success: true }> {
    await this.payments.softDelete(command.id, command.actorId);
    return { success: true };
  }
}
