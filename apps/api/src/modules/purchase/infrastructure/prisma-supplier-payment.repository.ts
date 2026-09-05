import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ageingBucketFor,
  buildPaginated,
  ConflictError,
  exceeds,
  isOutstanding,
  NotFoundError,
  overdueDays,
  ValidationError,
} from '@tiles-erp/shared';
import type {
  OpenBillItem,
  OpenDebitNoteItem,
  Paginated,
  PaginationQuery,
  PayableRow,
  SupplierDueSummary,
  SupplierLedger,
  SupplierLedgerEntry,
  SupplierPaymentItem,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { CashPostingService } from '../../accounts/infrastructure/cash-posting.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  SupplierPaymentFilter,
  SupplierPaymentRepository,
  SupplierPaymentWriteData,
} from '../domain/supplier-payment.repository';

const include = {
  supplier: { select: { name: true } },
  branch: { select: { name: true } },
  tenders: { include: { account: { select: { name: true } } } },
  allocations: {
    include: {
      purchaseInvoice: {
        select: {
          invoiceNumber: true,
          supplierInvoiceNo: true,
          invoiceDate: true,
          grandTotal: true,
        },
      },
    },
  },
  debitNotes: {
    include: {
      purchaseReturn: { select: { returnNumber: true, returnDate: true, grandTotal: true } },
    },
  },
} satisfies Prisma.SupplierPaymentInclude;

type Row = Prisma.SupplierPaymentGetPayload<{ include: typeof include }>;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** "Bank 50,000 + Cash 5,000" — how the money actually left, in one line. */
const summarise = (tenders: Row['tenders']): string =>
  tenders
    .map(
      (tender) =>
        `${tender.mode.charAt(0)}${tender.mode.slice(1).toLowerCase()} ${Number(
          tender.amount,
        ).toLocaleString('en-IN')}`,
    )
    .join(' + ');

const toItem = (row: Row, withDetail: boolean): SupplierPaymentItem => {
  const amount = Number(row.amount);
  const adjustedAmount = Number(row.adjustedAmount);
  const allocatedAmount = Number(row.allocatedAmount);
  const settledAmount = round2(amount + adjustedAmount);

  return {
    id: row.id,
    paymentNumber: row.paymentNumber,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    branchId: row.branchId,
    branchName: row.branch.name,
    paymentDate: row.paymentDate.toISOString(),
    mode: row.mode,
    status: row.status,
    // A pure set-off moved no money, so saying "Bank 0" would be a lie.
    modeSummary: row.tenders.length > 0 ? summarise(row.tenders) : 'Debit note set-off',
    amount,
    adjustedAmount,
    settledAmount,
    allocatedAmount,
    onAccountAmount: round2(settledAmount - allocatedAmount),
    remarks: row.remarks,
    cancelReason: row.cancelReason,
    version: row.version,
    ...(withDetail
      ? {
          tenders: row.tenders.map((tender) => ({
            id: tender.id,
            mode: tender.mode,
            amount: Number(tender.amount),
            referenceNo: tender.referenceNo,
            accountId: tender.accountId,
            accountName: tender.account?.name ?? null,
            bankName: tender.bankName,
          })),
          allocations: row.allocations.map((allocation) => ({
            id: allocation.id,
            purchaseInvoiceId: allocation.purchaseInvoiceId,
            invoiceNumber: allocation.purchaseInvoice.invoiceNumber,
            supplierInvoiceNo: allocation.purchaseInvoice.supplierInvoiceNo,
            invoiceDate: allocation.purchaseInvoice.invoiceDate.toISOString(),
            invoiceTotal: Number(allocation.purchaseInvoice.grandTotal),
            amount: Number(allocation.amount),
          })),
          debitNotes: row.debitNotes.map((note) => ({
            id: note.id,
            purchaseReturnId: note.purchaseReturnId,
            returnNumber: note.purchaseReturn.returnNumber,
            returnDate: note.purchaseReturn.returnDate.toISOString(),
            returnTotal: Number(note.purchaseReturn.grandTotal),
            amount: Number(note.amount),
          })),
        }
      : {}),
  };
};

@Injectable()
export class PrismaSupplierPaymentRepository implements SupplierPaymentRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
    private readonly cash: CashPostingService,
  ) {}

  async nextPaymentNumber(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'SUPPLIER_PAYMENT', branchId ?? null);
  }

  async list(
    query: PaginationQuery,
    filter: SupplierPaymentFilter,
  ): Promise<Paginated<SupplierPaymentItem>> {
    const where: Prisma.SupplierPaymentWhereInput = {
      deletedAt: null,
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      // A cheque number is what gets asked about on the phone, so it is searchable.
      ...(query.search
        ? {
            OR: [
              { paymentNumber: { contains: query.search, mode: 'insensitive' as const } },
              {
                tenders: {
                  some: { referenceNo: { contains: query.search, mode: 'insensitive' as const } },
                },
              },
              { supplier: { name: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplierPayment.findMany({
        where,
        include,
        orderBy: { paymentDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => toItem(row, false)),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: UUID): Promise<SupplierPaymentItem | null> {
    const row = await this.prisma.supplierPayment.findFirst({
      where: { id, deletedAt: null },
      include,
    });
    return row ? toItem(row, true) : null;
  }

  async create(
    number: string,
    data: SupplierPaymentWriteData,
    createdBy: UUID,
  ): Promise<SupplierPaymentItem> {
    const row = await this.prisma.supplierPayment.create({
      data: {
        paymentNumber: number,
        supplierId: data.supplierId,
        branchId: data.branchId,
        paymentDate: data.paymentDate,
        mode: data.mode,
        amount: data.amount,
        adjustedAmount: data.adjustedAmount,
        allocatedAmount: data.allocatedAmount,
        remarks: data.remarks,
        createdBy,
        tenders: { create: data.tenders },
        allocations: { create: data.allocations },
        debitNotes: { create: data.debitNotes },
      },
      include,
    });
    return toItem(row, true);
  }

  async update(
    id: UUID,
    version: number,
    data: SupplierPaymentWriteData,
    updatedBy: UUID,
  ): Promise<SupplierPaymentItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.supplierPayment.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError('Payment not found');
      if (existing.status !== 'DRAFT') {
        throw new ValidationError('Only draft payments can be edited');
      }

      const updated = await tx.supplierPayment.updateMany({
        where: { id, version },
        data: {
          supplierId: data.supplierId,
          branchId: data.branchId,
          paymentDate: data.paymentDate,
          mode: data.mode,
          amount: data.amount,
          adjustedAmount: data.adjustedAmount,
          allocatedAmount: data.allocatedAmount,
          remarks: data.remarks,
          updatedBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Payment was modified by someone else. Reload and retry.');
      }

      await tx.supplierPaymentTender.deleteMany({ where: { paymentId: id } });
      await tx.supplierPaymentTender.createMany({
        data: data.tenders.map((tender) => ({ ...tender, paymentId: id })),
      });
      await tx.supplierPaymentAllocation.deleteMany({ where: { paymentId: id } });
      await tx.supplierPaymentAllocation.createMany({
        data: data.allocations.map((allocation) => ({ ...allocation, paymentId: id })),
      });
      await tx.supplierPaymentDebitNote.deleteMany({ where: { paymentId: id } });
      await tx.supplierPaymentDebitNote.createMany({
        data: data.debitNotes.map((note) => ({ ...note, paymentId: id })),
      });

      return tx.supplierPayment.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  /**
   * Posting moves the money onto the bills and spends the debit notes.
   *
   * Both balances are re-checked inside the transaction, so two clerks cannot settle the
   * same bill or spend the same credit twice between them.
   */
  async post(id: UUID, version: number, postedBy: UUID): Promise<SupplierPaymentItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.findFirst({
        where: { id, deletedAt: null },
        include,
      });
      if (!payment) throw new NotFoundError('Payment not found');
      if (payment.status === 'POSTED') throw new ValidationError('Payment is already posted');
      if (payment.status === 'CANCELLED') throw new ValidationError('Payment is cancelled');

      for (const note of payment.debitNotes) {
        const purchaseReturn = await tx.purchaseReturn.findFirst({
          where: { id: note.purchaseReturnId, deletedAt: null },
          select: {
            returnNumber: true,
            status: true,
            grandTotal: true,
            adjustedAmount: true,
          },
        });
        if (!purchaseReturn) throw new ValidationError('A debit note no longer exists');
        if (purchaseReturn.status !== 'POSTED') {
          throw new ValidationError(`${purchaseReturn.returnNumber} is not a posted debit note`);
        }

        const credit = round2(
          Number(purchaseReturn.grandTotal) - Number(purchaseReturn.adjustedAmount),
        );
        const amount = Number(note.amount);
        if (exceeds(amount, credit)) {
          throw new ValidationError(
            `${purchaseReturn.returnNumber} only has ${credit} of credit left, cannot set off ${amount}`,
          );
        }

        await tx.purchaseReturn.update({
          where: { id: note.purchaseReturnId },
          data: { adjustedAmount: { increment: amount }, updatedBy: postedBy },
        });
      }

      for (const allocation of payment.allocations) {
        const invoice = await tx.purchaseInvoice.findFirst({
          where: { id: allocation.purchaseInvoiceId, deletedAt: null },
          select: {
            supplierInvoiceNo: true,
            status: true,
            grandTotal: true,
            paidAmount: true,
          },
        });
        if (!invoice) throw new ValidationError('An allocated bill no longer exists');
        if (invoice.status !== 'POSTED') {
          throw new ValidationError(`${invoice.supplierInvoiceNo} is not a posted bill`);
        }

        const balance = round2(Number(invoice.grandTotal) - Number(invoice.paidAmount));
        const amount = Number(allocation.amount);
        if (exceeds(amount, balance)) {
          throw new ValidationError(
            `${invoice.supplierInvoiceNo} only has ${balance} outstanding, cannot settle ${amount}`,
          );
        }

        await tx.purchaseInvoice.update({
          where: { id: allocation.purchaseInvoiceId },
          data: { paidAmount: { increment: amount }, updatedBy: postedBy },
        });
      }

      // The money leaves the accounts the clerk named, inside the same transaction. If a
      // drawer is short the whole payment fails rather than posting a bill as settled with
      // cash that was not there.
      for (const tender of payment.tenders) {
        if (!tender.accountId) continue;
        await this.cash.post(
          tx,
          {
            accountId: tender.accountId,
            entryDate: payment.paymentDate,
            type: 'PAYMENT',
            direction: 'OUT',
            amount: Number(tender.amount),
            source: 'SUPPLIER_PAYMENT',
            refType: 'SupplierPayment',
            refId: payment.id,
            refNumber: payment.paymentNumber,
            referenceNo: tender.referenceNo,
            narration: `${payment.supplier.name} — ${payment.paymentNumber}`,
          },
          postedBy,
        );
      }

      const updated = await tx.supplierPayment.updateMany({
        where: { id, version },
        data: {
          status: 'POSTED',
          postedAt: new Date(),
          postedBy,
          updatedBy: postedBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Payment was modified by someone else. Reload and retry.');
      }
      return tx.supplierPayment.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async cancel(
    id: UUID,
    version: number,
    reason: string,
    cancelledBy: UUID,
  ): Promise<SupplierPaymentItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.findFirst({
        where: { id, deletedAt: null },
        include,
      });
      if (!payment) throw new NotFoundError('Payment not found');
      if (payment.status === 'CANCELLED') throw new ValidationError('Payment is already cancelled');

      // Only a posted payment took anything; cancelling a draft has nothing to undo.
      if (payment.status === 'POSTED') {
        for (const allocation of payment.allocations) {
          await tx.purchaseInvoice.update({
            where: { id: allocation.purchaseInvoiceId },
            data: {
              paidAmount: { decrement: Number(allocation.amount) },
              updatedBy: cancelledBy,
            },
          });
        }
        for (const note of payment.debitNotes) {
          await tx.purchaseReturn.update({
            where: { id: note.purchaseReturnId },
            data: { adjustedAmount: { decrement: Number(note.amount) }, updatedBy: cancelledBy },
          });
        }

        // The money comes back into the account it left, as a contra row.
        await this.cash.reverseFor(
          tx,
          'SupplierPayment',
          payment.id,
          `${payment.paymentNumber} cancelled — ${reason}`,
          cancelledBy,
        );
      }

      const updated = await tx.supplierPayment.updateMany({
        where: { id, version },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy,
          cancelReason: reason,
          updatedBy: cancelledBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Payment was modified by someone else. Reload and retry.');
      }
      return tx.supplierPayment.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.supplierPayment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Payment not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError('Only draft payments can be deleted; cancel posted ones instead');
    }
    await this.prisma.supplierPayment.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy, version: { increment: 1 } },
    });
  }

  /**
   * Open bills, soonest due first.
   *
   * The order is the whole point: automatic allocation follows it, and what you want
   * cleared next is whatever falls due next — not whatever was billed first. A supplier
   * on 60 days can bill you before one on 7 days who still needs paying sooner.
   */
  async openBills(supplierId: UUID, branchId?: UUID): Promise<OpenBillItem[]> {
    const rows = await this.prisma.purchaseInvoice.findMany({
      where: {
        supplierId,
        deletedAt: null,
        status: 'POSTED',
        ...(branchId ? { branchId } : {}),
      },
      select: {
        id: true,
        invoiceNumber: true,
        supplierInvoiceNo: true,
        invoiceDate: true,
        dueDate: true,
        grandTotal: true,
        paidAmount: true,
      },
    });

    return rows
      .map((row) => {
        const grandTotal = Number(row.grandTotal);
        const paidAmount = Number(row.paidAmount);
        return {
          purchaseInvoiceId: row.id,
          invoiceNumber: row.invoiceNumber,
          supplierInvoiceNo: row.supplierInvoiceNo,
          invoiceDate: row.invoiceDate.toISOString(),
          dueDate: row.dueDate ? row.dueDate.toISOString() : null,
          grandTotal,
          paidAmount,
          balanceAmount: round2(grandTotal - paidAmount),
          overdueDays: Math.max(overdueDays(row.dueDate, row.invoiceDate), 0),
          // Kept only for sorting; a bill with no due date was payable on sight.
          dueOn: (row.dueDate ?? row.invoiceDate).getTime(),
        };
      })
      .filter((row) => isOutstanding(row.balanceAmount))
      .sort((a, b) => a.dueOn - b.dueOn)
      .map(({ dueOn: _dueOn, ...row }) => row);
  }

  async openDebitNotes(supplierId: UUID, branchId?: UUID): Promise<OpenDebitNoteItem[]> {
    const rows = await this.prisma.purchaseReturn.findMany({
      where: {
        supplierId,
        deletedAt: null,
        status: 'POSTED',
        ...(branchId ? { branchId } : {}),
      },
      select: {
        id: true,
        returnNumber: true,
        returnDate: true,
        grandTotal: true,
        adjustedAmount: true,
      },
      orderBy: { returnDate: 'asc' },
    });

    return rows
      .map((row) => {
        const grandTotal = Number(row.grandTotal);
        const adjustedAmount = Number(row.adjustedAmount);
        return {
          purchaseReturnId: row.id,
          returnNumber: row.returnNumber,
          returnDate: row.returnDate.toISOString(),
          grandTotal,
          adjustedAmount,
          balanceAmount: round2(grandTotal - adjustedAmount),
        };
      })
      .filter((row) => isOutstanding(row.balanceAmount));
  }

  async dueSummary(supplierId: UUID, branchId?: UUID): Promise<SupplierDueSummary> {
    const [bills, notes, advances] = await Promise.all([
      this.openBills(supplierId, branchId),
      this.openDebitNotes(supplierId, branchId),
      this.prisma.supplierPayment.findMany({
        where: {
          supplierId,
          deletedAt: null,
          status: 'POSTED',
          ...(branchId ? { branchId } : {}),
        },
        select: { amount: true, adjustedAmount: true, allocatedAmount: true },
      }),
    ]);

    return {
      supplierId,
      payableAmount: round2(bills.reduce((sum, bill) => sum + bill.balanceAmount, 0)),
      overdueAmount: round2(
        bills.filter((bill) => bill.overdueDays > 0).reduce((sum, bill) => sum + bill.balanceAmount, 0),
      ),
      billCount: bills.length,
      creditAvailable: round2(notes.reduce((sum, note) => sum + note.balanceAmount, 0)),
      advanceAmount: round2(
        advances.reduce(
          (sum, payment) =>
            sum +
            Number(payment.amount) +
            Number(payment.adjustedAmount) -
            Number(payment.allocatedAmount),
          0,
        ),
      ),
    };
  }

  async assertSupplier(supplierId: UUID, branchId: UUID): Promise<void> {
    const [supplier, branch] = await Promise.all([
      this.prisma.supplier.findFirst({
        where: { id: supplierId, deletedAt: null },
        select: { isActive: true },
      }),
      this.prisma.branch.findFirst({
        where: { id: branchId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!supplier) throw new ValidationError('Supplier not found');
    if (!supplier.isActive) throw new ValidationError('Supplier is inactive');
    if (!branch) throw new ValidationError('Branch not found');
  }

  /**
   * The supplier statement.
   *
   * A supplier is a creditor, so the signs are the reverse of a customer's: their bills
   * credit the account and what you pay debits it. A debit note debits it too — goods
   * sent back reduce what you owe just as money does.
   */
  async ledger(supplierId: UUID, from?: Date, to?: Date): Promise<SupplierLedger> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
      select: { name: true, openingBalance: true },
    });
    if (!supplier) throw new NotFoundError('Supplier not found');

    const [invoices, returns, payments] = await Promise.all([
      this.prisma.purchaseInvoice.findMany({
        where: { supplierId, deletedAt: null, status: 'POSTED' },
        select: { supplierInvoiceNo: true, invoiceDate: true, grandTotal: true },
        orderBy: { invoiceDate: 'asc' },
      }),
      this.prisma.purchaseReturn.findMany({
        where: { supplierId, deletedAt: null, status: 'POSTED' },
        select: { returnNumber: true, returnDate: true, grandTotal: true },
        orderBy: { returnDate: 'asc' },
      }),
      this.prisma.supplierPayment.findMany({
        where: { supplierId, deletedAt: null, status: 'POSTED' },
        select: { paymentNumber: true, paymentDate: true, amount: true, mode: true },
        orderBy: { paymentDate: 'asc' },
      }),
    ]);

    const movements: { date: Date; entry: Omit<SupplierLedgerEntry, 'balance'> }[] = [
      ...invoices.map((invoice) => ({
        date: invoice.invoiceDate,
        entry: {
          date: invoice.invoiceDate.toISOString(),
          type: 'INVOICE' as const,
          reference: invoice.supplierInvoiceNo,
          particulars: 'Purchase invoice',
          debit: 0,
          credit: Number(invoice.grandTotal),
        },
      })),
      ...returns.map((purchaseReturn) => ({
        date: purchaseReturn.returnDate,
        entry: {
          date: purchaseReturn.returnDate.toISOString(),
          type: 'RETURN' as const,
          reference: purchaseReturn.returnNumber,
          particulars: 'Debit note — goods returned',
          debit: Number(purchaseReturn.grandTotal),
          credit: 0,
        },
      })),
      // Only the cash leg appears. The credit leg is already in the statement as the
      // debit note itself, and counting it again would pay the same money twice.
      ...payments.map((payment) => ({
        date: payment.paymentDate,
        entry: {
          date: payment.paymentDate.toISOString(),
          type: 'PAYMENT' as const,
          reference: payment.paymentNumber,
          particulars: `Payment (${payment.mode.toLowerCase()})`,
          debit: Number(payment.amount),
          credit: 0,
        },
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Anything before the window folds into the opening balance, so a dated statement
    // still adds up.
    let balance = Number(supplier.openingBalance);
    const entries: SupplierLedgerEntry[] = [];
    let totalDebit = 0;
    let totalCredit = 0;

    for (const movement of movements) {
      if (from && movement.date < from) {
        balance = round2(balance + movement.entry.credit - movement.entry.debit);
        continue;
      }
      if (to && movement.date > to) continue;

      if (entries.length === 0) {
        entries.push({
          date: (from ?? movement.date).toISOString(),
          type: 'OPENING',
          reference: '—',
          particulars: 'Opening balance',
          debit: 0,
          credit: 0,
          balance: round2(balance),
        });
      }
      balance = round2(balance + movement.entry.credit - movement.entry.debit);
      totalDebit = round2(totalDebit + movement.entry.debit);
      totalCredit = round2(totalCredit + movement.entry.credit);
      entries.push({ ...movement.entry, balance });
    }

    const openingBalance = entries[0]?.balance ?? round2(balance);
    if (entries.length === 0) {
      entries.push({
        date: (from ?? new Date()).toISOString(),
        type: 'OPENING',
        reference: '—',
        particulars: 'Opening balance',
        debit: 0,
        credit: 0,
        balance: openingBalance,
      });
    }

    return {
      supplierId,
      supplierName: supplier.name,
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance: round2(balance),
      entries,
    };
  }

  /** Every supplier owed money, bucketed by how long the bill has been due. */
  async payables(branchId?: UUID): Promise<PayableRow[]> {
    const [bills, notes] = await Promise.all([
      this.prisma.purchaseInvoice.findMany({
        where: { deletedAt: null, status: 'POSTED', ...(branchId ? { branchId } : {}) },
        select: {
          supplierId: true,
          invoiceDate: true,
          dueDate: true,
          grandTotal: true,
          paidAmount: true,
          supplier: { select: { name: true, phone: true, paymentTermDays: true } },
        },
      }),
      this.prisma.purchaseReturn.findMany({
        where: { deletedAt: null, status: 'POSTED', ...(branchId ? { branchId } : {}) },
        select: { supplierId: true, grandTotal: true, adjustedAmount: true },
      }),
    ]);

    const bySupplier = new Map<string, PayableRow>();

    for (const bill of bills) {
      const balance = round2(Number(bill.grandTotal) - Number(bill.paidAmount));
      if (!isOutstanding(balance)) continue;

      const row = bySupplier.get(bill.supplierId) ?? {
        supplierId: bill.supplierId,
        supplierName: bill.supplier.name,
        phone: bill.supplier.phone,
        paymentTermDays: bill.supplier.paymentTermDays,
        balanceAmount: 0,
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        older: 0,
        oldestBillDate: null,
        creditAvailable: 0,
      };

      const bucket = ageingBucketFor(overdueDays(bill.dueDate, bill.invoiceDate));
      row[bucket] = round2(row[bucket] + balance);
      row.balanceAmount = round2(row.balanceAmount + balance);

      const billDate = bill.invoiceDate.toISOString();
      if (!row.oldestBillDate || billDate < row.oldestBillDate) row.oldestBillDate = billDate;

      bySupplier.set(bill.supplierId, row);
    }

    // Unspent credit is shown against a supplier even when nothing is owed, because it
    // is money you are entitled to and easy to forget.
    for (const note of notes) {
      const credit = round2(Number(note.grandTotal) - Number(note.adjustedAmount));
      if (!isOutstanding(credit)) continue;
      const row = bySupplier.get(note.supplierId);
      if (row) row.creditAvailable = round2(row.creditAvailable + credit);
    }

    return [...bySupplier.values()].sort((a, b) => b.balanceAmount - a.balanceAmount);
  }
}
