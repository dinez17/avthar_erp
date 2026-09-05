import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ageingBucketFor,
  buildPaginated,
  ConflictError,
  NotFoundError,
  overdueDays,
  ValidationError,
} from '@tiles-erp/shared';
import type {
  CustomerDueSummary,
  CustomerLedger,
  CustomerReceiptItem,
  LedgerEntry,
  OpenInvoiceItem,
  OutstandingRow,
  Paginated,
  PaginationQuery,
  ReceiptPrintData,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { CashPostingService } from '../../accounts/infrastructure/cash-posting.service';
import { toPartyBlock } from './letterhead';
import type {
  ReceiptFilter,
  ReceiptRepository,
  ReceiptWriteData,
} from '../domain/receipt.repository';

const include = {
  customer: { select: { name: true } },
  branch: { select: { name: true } },
  payments: { include: { account: { select: { name: true } } } },
  allocations: {
    include: {
      salesInvoice: { select: { invoiceNumber: true, invoiceDate: true, grandTotal: true } },
    },
  },
} satisfies Prisma.CustomerReceiptInclude;

type Row = Prisma.CustomerReceiptGetPayload<{ include: typeof include }>;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** "Cash 1,000 + UPI 5,000" — how the money actually arrived, in one line. */
const summarise = (payments: Row['payments']): string =>
  payments
    .map(
      (payment) =>
        `${payment.mode.charAt(0)}${payment.mode.slice(1).toLowerCase()} ${Number(
          payment.amount,
        ).toLocaleString('en-IN')}`,
    )
    .join(' + ');

const toItem = (row: Row, withAllocations: boolean): CustomerReceiptItem => {
  const amount = Number(row.amount);
  const allocatedAmount = Number(row.allocatedAmount);
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    customerId: row.customerId,
    customerName: row.customer.name,
    branchId: row.branchId,
    branchName: row.branch.name,
    receiptDate: row.receiptDate.toISOString(),
    mode: row.mode,
    status: row.status,
    modeSummary: summarise(row.payments),
    amount,
    allocatedAmount,
    onAccountAmount: round2(amount - allocatedAmount),
    remarks: row.remarks,
    cancelReason: row.cancelReason,
    version: row.version,
    ...(withAllocations
      ? {
          payments: row.payments.map((payment) => ({
            id: payment.id,
            mode: payment.mode,
            amount: Number(payment.amount),
            referenceNo: payment.referenceNo,
            accountId: payment.accountId,
            accountName: payment.account?.name ?? null,
            bankName: payment.bankName,
          })),
          allocations: row.allocations.map((allocation) => ({
            id: allocation.id,
            salesInvoiceId: allocation.salesInvoiceId,
            invoiceNumber: allocation.salesInvoice.invoiceNumber,
            invoiceDate: allocation.salesInvoice.invoiceDate.toISOString(),
            invoiceTotal: Number(allocation.salesInvoice.grandTotal),
            amount: Number(allocation.amount),
          })),
        }
      : {}),
  };
};

@Injectable()
export class PrismaReceiptRepository implements ReceiptRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
    private readonly cash: CashPostingService,
  ) {}

  async nextReceiptNumber(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'RECEIPT', branchId ?? null);
  }

  async list(
    query: PaginationQuery,
    filter: ReceiptFilter,
  ): Promise<Paginated<CustomerReceiptItem>> {
    const where: Prisma.CustomerReceiptWhereInput = {
      deletedAt: null,
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(query.search
        ? {
            OR: [
              { receiptNumber: { contains: query.search, mode: 'insensitive' } },
              { payments: { some: { referenceNo: { contains: query.search, mode: 'insensitive' } } } },
              { customer: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customerReceipt.findMany({
        where,
        include,
        orderBy: { receiptDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.customerReceipt.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => toItem(row, false)),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: UUID): Promise<CustomerReceiptItem | null> {
    const row = await this.prisma.customerReceipt.findFirst({
      where: { id, deletedAt: null },
      include,
    });
    return row ? toItem(row, true) : null;
  }

  async create(
    number: string,
    data: ReceiptWriteData,
    createdBy: UUID,
  ): Promise<CustomerReceiptItem> {
    const row = await this.prisma.customerReceipt.create({
      data: {
        receiptNumber: number,
        customerId: data.customerId,
        branchId: data.branchId,
        receiptDate: data.receiptDate,
        mode: data.mode,
        amount: data.amount,
        allocatedAmount: data.allocatedAmount,
        remarks: data.remarks,
        createdBy,
        payments: { create: data.payments },
        allocations: { create: data.allocations },
      },
      include,
    });
    return toItem(row, true);
  }

  async update(
    id: UUID,
    version: number,
    data: ReceiptWriteData,
    updatedBy: UUID,
  ): Promise<CustomerReceiptItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.customerReceipt.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError('Receipt not found');
      if (existing.status !== 'DRAFT') {
        throw new ValidationError('Only draft receipts can be edited');
      }
      const updated = await tx.customerReceipt.updateMany({
        where: { id, version },
        data: {
          customerId: data.customerId,
          branchId: data.branchId,
          receiptDate: data.receiptDate,
          mode: data.mode,
          amount: data.amount,
          allocatedAmount: data.allocatedAmount,
          remarks: data.remarks,
          updatedBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Receipt was modified by someone else. Reload and retry.');
      }
      await tx.customerReceiptPayment.deleteMany({ where: { receiptId: id } });
      await tx.customerReceiptPayment.createMany({
        data: data.payments.map((payment) => ({ ...payment, receiptId: id })),
      });
      await tx.customerReceiptAllocation.deleteMany({ where: { receiptId: id } });
      await tx.customerReceiptAllocation.createMany({
        data: data.allocations.map((allocation) => ({ ...allocation, receiptId: id })),
      });
      return tx.customerReceipt.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  /**
   * Posting moves the money onto the invoices. The balance is re-checked inside the
   * transaction so two clerks cannot both settle the same outstanding amount.
   */
  async post(id: UUID, version: number, postedBy: UUID): Promise<CustomerReceiptItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.customerReceipt.findFirst({
        where: { id, deletedAt: null },
        include,
      });
      if (!receipt) throw new NotFoundError('Receipt not found');
      if (receipt.status === 'POSTED') throw new ValidationError('Receipt is already posted');
      if (receipt.status === 'CANCELLED') throw new ValidationError('Receipt is cancelled');

      for (const allocation of receipt.allocations) {
        const invoice = await tx.salesInvoice.findFirst({
          where: { id: allocation.salesInvoiceId, deletedAt: null },
          select: { invoiceNumber: true, status: true, grandTotal: true, paidAmount: true },
        });
        if (!invoice) throw new ValidationError('An allocated invoice no longer exists');
        if (invoice.status !== 'POSTED') {
          throw new ValidationError(`${invoice.invoiceNumber} is not a posted invoice`);
        }

        const balance = round2(Number(invoice.grandTotal) - Number(invoice.paidAmount));
        const amount = Number(allocation.amount);
        if (amount > balance + 0.005) {
          throw new ValidationError(
            `${invoice.invoiceNumber} only has ${balance} outstanding, cannot settle ${amount}`,
          );
        }

        await tx.salesInvoice.update({
          where: { id: allocation.salesInvoiceId },
          data: { paidAmount: { increment: amount }, updatedBy: postedBy },
        });
      }

      // The money lands in the accounts the clerk named, in the same transaction that
      // posts the receipt. Typing it into the cash book a second time is how a drawer and
      // a receipt book stop agreeing.
      for (const payment of receipt.payments) {
        if (!payment.accountId) continue;
        await this.cash.post(
          tx,
          {
            accountId: payment.accountId,
            entryDate: receipt.receiptDate,
            type: 'RECEIPT',
            direction: 'IN',
            amount: Number(payment.amount),
            source: 'CUSTOMER_RECEIPT',
            refType: 'CustomerReceipt',
            refId: receipt.id,
            refNumber: receipt.receiptNumber,
            referenceNo: payment.referenceNo,
            narration: `${receipt.customer.name} — ${receipt.receiptNumber}`,
          },
          postedBy,
        );
      }

      const updated = await tx.customerReceipt.updateMany({
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
        throw new ConflictError('Receipt was modified by someone else. Reload and retry.');
      }
      return tx.customerReceipt.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async cancel(
    id: UUID,
    version: number,
    reason: string,
    cancelledBy: UUID,
  ): Promise<CustomerReceiptItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.customerReceipt.findFirst({
        where: { id, deletedAt: null },
        include,
      });
      if (!receipt) throw new NotFoundError('Receipt not found');
      if (receipt.status === 'CANCELLED') throw new ValidationError('Receipt is already cancelled');

      if (receipt.status === 'POSTED') {
        for (const allocation of receipt.allocations) {
          await tx.salesInvoice.update({
            where: { id: allocation.salesInvoiceId },
            data: { paidAmount: { decrement: Number(allocation.amount) }, updatedBy: cancelledBy },
          });
        }

        // The money has to come back out of the account it went into. A contra row rather
        // than a deletion, so the book still shows that it arrived and then did not.
        await this.cash.reverseFor(
          tx,
          'CustomerReceipt',
          receipt.id,
          `${receipt.receiptNumber} cancelled — ${reason}`,
          cancelledBy,
        );
      }

      const updated = await tx.customerReceipt.updateMany({
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
        throw new ConflictError('Receipt was modified by someone else. Reload and retry.');
      }
      return tx.customerReceipt.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.customerReceipt.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Receipt not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError('Only draft receipts can be deleted; cancel posted ones instead');
    }
    await this.prisma.customerReceipt.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy, version: { increment: 1 } },
    });
  }

  async openInvoices(customerId: UUID, branchId?: UUID): Promise<OpenInvoiceItem[]> {
    const rows = await this.prisma.salesInvoice.findMany({
      where: {
        customerId,
        deletedAt: null,
        status: 'POSTED',
        ...(branchId ? { branchId } : {}),
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        grandTotal: true,
        paidAmount: true,
      },
      orderBy: { invoiceDate: 'asc' },
    });

    return rows
      .map((row) => {
        const grandTotal = Number(row.grandTotal);
        const paidAmount = Number(row.paidAmount);
        return {
          salesInvoiceId: row.id,
          invoiceNumber: row.invoiceNumber,
          invoiceDate: row.invoiceDate.toISOString(),
          dueDate: row.dueDate ? row.dueDate.toISOString() : null,
          grandTotal,
          paidAmount,
          balanceAmount: round2(grandTotal - paidAmount),
          overdueDays: Math.max(overdueDays(row.dueDate, row.invoiceDate), 0),
        };
      })
      .filter((row) => row.balanceAmount > 0.005);
  }

  async printData(id: UUID): Promise<ReceiptPrintData | null> {
    const row = await this.prisma.customerReceipt.findFirst({
      where: { id, deletedAt: null },
      include: { ...include, branch: { include: { company: true } } },
    });
    if (!row) return null;

    const due = await this.dueSummary(row.customerId);

    return {
      receipt: toItem(row as unknown as Row, true),
      company: toPartyBlock(row.branch.company),
      branch: toPartyBlock({ ...row.branch, legalName: null }),
      balanceAmount: due.outstandingAmount,
    };
  }

  async dueSummary(customerId: UUID, branchId?: UUID): Promise<CustomerDueSummary> {
    const open = await this.openInvoices(customerId, branchId);
    return {
      customerId,
      outstandingAmount: round2(
        open.reduce((sum, invoice) => sum + invoice.balanceAmount, 0),
      ),
      overdueAmount: round2(
        open
          .filter((invoice) => invoice.overdueDays > 0)
          .reduce((sum, invoice) => sum + invoice.balanceAmount, 0),
      ),
      invoiceCount: open.length,
    };
  }

  async assertCustomer(customerId: UUID, branchId: UUID): Promise<void> {
    const [customer, branch] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { id: customerId, deletedAt: null },
        select: { isActive: true },
      }),
      this.prisma.branch.findFirst({ where: { id: branchId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!customer) throw new ValidationError('Customer not found');
    if (!customer.isActive) throw new ValidationError('Customer is inactive');
    if (!branch) throw new ValidationError('Branch not found');
  }

  /**
   * The statement: the opening balance, then every posted invoice as a debit and every
   * posted receipt as a credit, in date order with a running balance.
   */
  async ledger(customerId: UUID, from?: Date, to?: Date): Promise<CustomerLedger> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { name: true, openingBalance: true },
    });
    if (!customer) throw new NotFoundError('Customer not found');

    const [invoices, receipts] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: { customerId, deletedAt: null, status: 'POSTED' },
        select: { invoiceNumber: true, invoiceDate: true, grandTotal: true },
        orderBy: { invoiceDate: 'asc' },
      }),
      this.prisma.customerReceipt.findMany({
        where: { customerId, deletedAt: null, status: 'POSTED' },
        select: { receiptNumber: true, receiptDate: true, amount: true, mode: true },
        orderBy: { receiptDate: 'asc' },
      }),
    ]);

    const movements: { date: Date; entry: Omit<LedgerEntry, 'balance'> }[] = [
      ...invoices.map((invoice) => ({
        date: invoice.invoiceDate,
        entry: {
          date: invoice.invoiceDate.toISOString(),
          type: 'INVOICE' as const,
          reference: invoice.invoiceNumber,
          particulars: 'Sales invoice',
          debit: Number(invoice.grandTotal),
          credit: 0,
        },
      })),
      ...receipts.map((receipt) => ({
        date: receipt.receiptDate,
        entry: {
          date: receipt.receiptDate.toISOString(),
          type: 'RECEIPT' as const,
          reference: receipt.receiptNumber,
          particulars: `Receipt (${receipt.mode.toLowerCase()})`,
          debit: 0,
          credit: Number(receipt.amount),
        },
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Anything before the window is folded into the opening balance, so the statement
    // still adds up when a date range is applied.
    let balance = Number(customer.openingBalance);
    const entries: LedgerEntry[] = [];
    let totalDebit = 0;
    let totalCredit = 0;

    for (const movement of movements) {
      if (from && movement.date < from) {
        balance = round2(balance + movement.entry.debit - movement.entry.credit);
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
      balance = round2(balance + movement.entry.debit - movement.entry.credit);
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
      customerId,
      customerName: customer.name,
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance: round2(balance),
      entries,
    };
  }

  /** Every customer with money owing, bucketed by how long it has been outstanding. */
  async outstanding(branchId?: UUID): Promise<OutstandingRow[]> {
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        deletedAt: null,
        status: 'POSTED',
        ...(branchId ? { branchId } : {}),
      },
      select: {
        customerId: true,
        invoiceDate: true,
        dueDate: true,
        grandTotal: true,
        paidAmount: true,
        customer: { select: { name: true, phone: true, creditLimit: true } },
      },
    });

    const byCustomer = new Map<string, OutstandingRow>();

    for (const invoice of invoices) {
      const balance = round2(Number(invoice.grandTotal) - Number(invoice.paidAmount));
      if (balance <= 0.005) continue;

      const row = byCustomer.get(invoice.customerId) ?? {
        customerId: invoice.customerId,
        customerName: invoice.customer.name,
        phone: invoice.customer.phone,
        creditLimit: Number(invoice.customer.creditLimit),
        balanceAmount: 0,
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        older: 0,
        oldestInvoiceDate: null,
      };

      const bucket = ageingBucketFor(overdueDays(invoice.dueDate, invoice.invoiceDate));
      row[bucket] = round2(row[bucket] + balance);

      row.balanceAmount = round2(row.balanceAmount + balance);
      const invoiceDate = invoice.invoiceDate.toISOString();
      if (!row.oldestInvoiceDate || invoiceDate < row.oldestInvoiceDate) {
        row.oldestInvoiceDate = invoiceDate;
      }

      byCustomer.set(invoice.customerId, row);
    }

    return [...byCustomer.values()].sort((a, b) => b.balanceAmount - a.balanceAmount);
  }
}
