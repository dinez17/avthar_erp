import { Injectable } from '@nestjs/common';
import type { DocumentType, Prisma } from '@prisma/client';
import {
  DEFAULT_NUMBER_FORMAT,
  financialYearOf,
  formatDocumentNumber,
  type NumberFormat,
} from '@tiles-erp/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The prefix each document falls back to when no branch has been given one.
 *
 * These are exactly the prefixes the code used before series existed, so an installation
 * that never opens the settings screen keeps numbering precisely as it did. Changing one
 * of these values would renumber a live series, so they are effectively frozen.
 */
export const FALLBACK_PREFIX: Record<DocumentType, string> = {
  QUOTATION: 'QT',
  SALES_ORDER: 'SO',
  SALES_INVOICE: 'INV',
  RECEIPT: 'RCPT',
  PURCHASE_ORDER: 'PO',
  GOODS_RECEIPT: 'GRN',
  PURCHASE_INVOICE: 'PINV',
  PURCHASE_RETURN: 'PRET',
  SUPPLIER_PAYMENT: 'PAY',
  STOCK_TRANSFER: 'TRF',
  TRANSFER_CHALLAN: 'DC',
  TRANSFER_INVOICE: 'STI',
  GATE_PASS: 'GP',
  DRIVER_CASH_HANDOVER: 'DCH',
  TRANSPORTER: 'TRN',
  DRIVER: 'DRV',
  CASH_ENTRY: 'CE',
  EXPENSE: 'EXP',
  CASH_COUNT: 'CC',
  CREDIT_APPROVAL: 'CRQ',
};

/**
 * Documents numbered once for the whole company rather than per branch.
 *
 * Transporters and drivers are masters that belong to no branch. The cash documents are
 * here for a harder reason: `cash_entries.entryNumber` is unique across the whole table,
 * but a per-branch counter gives every branch its own count — so two branches sharing a
 * prefix both reach `CE/26-27/0001` and the second insert fails. Cash accounts can be
 * company-wide anyway (an owner's holding belongs to no branch), so there was never a
 * branch to count by. One counter, one namespace, no collision.
 *
 * See NUMBER_SERIES.md — the same trap exists for any two branches left on the built-in
 * prefix for a branch-wise document.
 */
const COMPANY_WIDE: DocumentType[] = [
  'TRANSPORTER',
  'DRIVER',
  'CASH_ENTRY',
  'EXPENSE',
  'CASH_COUNT',
  'CREDIT_APPROVAL',
];

/** Anything that can run a query: the Prisma client, or a transaction handle. */
export type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class DocumentNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The next number for a document, allocated and recorded in one step.
   *
   * **Call this inside the transaction that writes the document.** The counter is
   * incremented under a row lock, so two tills asking at the same moment are serialised
   * and get different numbers — and if the document write then fails, the transaction
   * rolls the counter back with it rather than burning a number.
   *
   * This replaced counting existing rows and adding one, which was wrong twice over: two
   * simultaneous callers counted the same total, and deleting a draft made the next
   * document reuse a number already printed.
   */
  async next(
    db: Db,
    documentType: DocumentType,
    branchId: string | null,
    at: Date = new Date(),
  ): Promise<string> {
    const scope = COMPANY_WIDE.includes(documentType) ? null : branchId;
    const format = await this.formatFor(db, documentType, scope);
    const financialYear = format.resetAnnually ? financialYearOf(at) : null;

    // upsert is the whole trick: it creates the row the first time and locks it every
    // time after, without a read-then-write race in between.
    const key = {
      documentType,
      scope: scope ?? '',
      financialYear: financialYear ?? '',
    };
    const sequence = await db.numberSequence.upsert({
      where: { sequenceKey: key },
      create: { ...key, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });

    return formatDocumentNumber(format, sequence.lastNumber, financialYear);
  }

  /**
   * How a series is composed: the branch's own setting, the company-wide one, or the
   * built-in default — in that order, so a branch overrides without having to be told
   * about every document type.
   */
  async formatFor(
    db: Db,
    documentType: DocumentType,
    branchId: string | null,
  ): Promise<NumberFormat> {
    const settings = await db.numberSeriesSetting.findMany({
      where: { documentType, branchId: branchId ? { in: [branchId] } : null },
      select: { branchId: true, prefix: true, separator: true, padding: true, resetAnnually: true },
    });

    const own = settings.find((setting) => setting.branchId === branchId);
    const chosen =
      own ??
      (branchId
        ? await db.numberSeriesSetting.findFirst({
            where: { documentType, branchId: null },
            select: {
              branchId: true,
              prefix: true,
              separator: true,
              padding: true,
              resetAnnually: true,
            },
          })
        : null);

    if (!chosen) {
      return { prefix: FALLBACK_PREFIX[documentType], ...DEFAULT_NUMBER_FORMAT };
    }
    return {
      prefix: chosen.prefix,
      separator: chosen.separator,
      padding: chosen.padding,
      resetAnnually: chosen.resetAnnually,
    };
  }

  /**
   * What the next number would be, without taking it.
   *
   * For a settings screen: showing the real next number is far more convincing than a
   * made-up sample, and reading the counter changes nothing.
   */
  async peek(
    documentType: DocumentType,
    branchId: string | null,
    at: Date = new Date(),
  ): Promise<string> {
    const scope = COMPANY_WIDE.includes(documentType) ? null : branchId;
    const format = await this.formatFor(this.prisma, documentType, scope);
    const financialYear = format.resetAnnually ? financialYearOf(at) : null;
    const sequence = await this.prisma.numberSequence.findUnique({
      where: {
        sequenceKey: {
          documentType,
          scope: scope ?? '',
          financialYear: financialYear ?? '',
        },
      },
      select: { lastNumber: true },
    });
    return formatDocumentNumber(format, (sequence?.lastNumber ?? 0) + 1, financialYear);
  }
}
