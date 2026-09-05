import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildPaginated,
  ConflictError,
  formatStockQuantity,
  NotFoundError,
  ValidationError,
} from '@tiles-erp/shared';
import type {
  InvoiceableLine,
  ProductPriceHint,
  Paginated,
  PaginationQuery,
  SalesInvoiceItem,
  SalesInvoiceLineItem,
  SalesInvoicePrintData,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { toLines, toPartyBlock } from './letterhead';
import type {
  BillingParties,
  SalesInvoiceFilter,
  SalesInvoiceRepository,
  SalesInvoiceWriteData,
} from '../domain/sales-invoice.repository';

const include = {
  branch: { select: { name: true } },
  salesOrder: { select: { orderNumber: true } },
  lines: {
    include: {
      product: {
        select: {
          sku: true,
          name: true,
          sizeMm: true,
          piecesPerBox: true,
          sqftPerBox: true,
          baseUom: true,
        },
      },
    },
  },
} satisfies Prisma.SalesInvoiceInclude;

type Row = Prisma.SalesInvoiceGetPayload<{ include: typeof include }>;

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const toLine = (
  line: Row['lines'][number],
  godownNames: Map<string, string>,
): SalesInvoiceLineItem => ({
  id: line.id,
  productId: line.productId,
  salesOrderLineId: line.salesOrderLineId,
  sku: line.product.sku,
  productName: line.product.name,
  sizeMm: line.product.sizeMm,
  piecesPerBox: line.product.piecesPerBox,
  baseUom: line.product.baseUom,
  hsnCode: line.hsnCode,
  godownId: line.godownId,
  godownName: godownNames.get(line.godownId) ?? 'Unknown godown',
  batchNo: line.batchNo,
  shade: line.shade,
  boxes: line.boxes,
  pieces: line.pieces,
  qtyBoxes: Number(line.qtyBoxes),
  mrp: line.mrp === null ? null : Number(line.mrp),
  rate: Number(line.rate),
  discountPct: Number(line.discountPct),
  gstRate: Number(line.gstRate),
  lineSubTotal: Number(line.lineSubTotal),
  lineCgst: Number(line.lineCgst),
  lineSgst: Number(line.lineSgst),
  lineIgst: Number(line.lineIgst),
  lineGst: Number(line.lineGst),
  lineTotal: Number(line.lineTotal),
});

const toItem = (
  row: Row,
  withLines: boolean,
  godownNames: Map<string, string> = new Map(),
): SalesInvoiceItem => {
  const grandTotal = Number(row.grandTotal);
  const paidAmount = Number(row.paidAmount);
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    salesOrderId: row.salesOrderId,
    orderNumber: row.salesOrder?.orderNumber ?? null,
    customerId: row.customerId,
    customerName: row.customerName,
    customerAddress: row.customerAddress,
    customerMobile: row.customerMobile,
    customerGstin: row.customerGstin,
    placeOfSupply: row.placeOfSupply,
    salesmanUserId: row.salesmanUserId,
    salesmanName: row.salesmanName,
    branchId: row.branchId,
    branchName: row.branch.name,
    invoiceDate: row.invoiceDate.toISOString(),
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    status: row.status,
    dispatchStatus: row.dispatchStatus,
    subTotal: Number(row.subTotal),
    cgstAmount: Number(row.cgstAmount),
    sgstAmount: Number(row.sgstAmount),
    igstAmount: Number(row.igstAmount),
    gstAmount: Number(row.gstAmount),
    freightCharge: Number(row.freightCharge),
    unloadingCharge: Number(row.unloadingCharge),
    loadingCharge: Number(row.loadingCharge),
    roundOff: Number(row.roundOff),
    grandTotal,
    paidAmount,
    balanceAmount: round2(grandTotal - paidAmount),
    remarks: row.remarks,
    cancelReason: row.cancelReason,
    lineCount: row.lines.length,
    totalBoxes: round2(row.lines.reduce((sum, line) => sum + Number(line.qtyBoxes), 0)),
    isInterState: Number(row.igstAmount) > 0,
    version: row.version,
    ...(withLines ? { lines: row.lines.map((line) => toLine(line, godownNames)) } : {}),
  };
};

@Injectable()
export class PrismaSalesInvoiceRepository implements SalesInvoiceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  /**
   * Why a line cannot be posted, and where the stock actually is.
   *
   * Every godown is named **with its branch**. Godown names repeat across branches — most
   * companies have a MAIN in each — so "MAIN has only 0 pcs" sends someone to the stock
   * screen, where a different branch's MAIN is showing 138, and they conclude the software
   * is lying. It is not; it never said which MAIN.
   *
   * Other branches are searched as well as other godowns. Since an order can be supplied
   * across branches, "there is none here" is only half an answer — the goods are usually
   * one branch away, and saying so turns a dead end into a decision.
   *
   * Quantities are spoken in the product's own unit — a tile sold by the piece is short by
   * pieces, not by boxes — following the app-wide rule in `QUANTITY_DISPLAY.md`.
   */
  private async shortStockMessage(
    tx: Pick<PrismaService, 'stockBalance' | 'godown'>,
    branchId: UUID,
    line: Row['lines'][number],
    available: number,
    wanted: number,
  ): Promise<string> {
    const say = (qty: number): string =>
      formatStockQuantity(
        qty,
        line.product.piecesPerBox,
        Number(line.product.sqftPerBox ?? 0),
        line.product.baseUom,
      );

    const at = (branch: string, godown: string): string => `${branch} · ${godown}`;

    const [thisGodown, elsewhere] = await Promise.all([
      tx.godown.findFirst({
        where: { id: line.godownId },
        select: { name: true, branchId: true, branch: { select: { name: true } } },
      }),
      // Everywhere this product is, including the godown that came up short: when a
      // line pins a batch or a gate, the stock is usually right there under a different
      // one, and excluding the godown reports "nowhere" about a full rack.
      tx.stockBalance.findMany({
        where: { productId: line.productId, qtyBoxes: { gt: 0 } },
        select: {
          qtyBoxes: true,
          branchId: true,
          godownId: true,
          batchNo: true,
          godown: { select: { name: true } },
          branch: { select: { name: true } },
        },
        orderBy: { qtyBoxes: 'desc' },
        take: 5,
      }),
    ]);

    const hereName = thisGodown
      ? at(thisGodown.branch.name, thisGodown.name)
      : 'that godown';
    const here = `${line.product.sku}: ${hereName} has only ${say(available)}, cannot invoice ${say(wanted)}`;

    // The godown belongs to somebody else. Said first, because every other explanation
    // is then wrong: the stock is exactly where it looks, on the wrong side of a branch
    // boundary, and no amount of batch-picking will move it.
    if (thisGodown && thisGodown.branchId !== branchId) {
      const invoiceBranch = await tx.godown.findFirst({
        where: { branchId },
        select: { branch: { select: { name: true } } },
      });
      return (
        `${line.product.sku}: this invoice is for ` +
        `${invoiceBranch?.branch.name ?? 'another branch'}, but ${hereName} belongs to ` +
        `${thisGodown.branch.name}. A branch can only invoice its own stock — delete this ` +
        'draft and use Raise invoices on the order, which cuts one invoice per supplying branch.'
      );
    }

    if (elsewhere.length === 0) {
      return `${here}. This product is not in stock anywhere.`;
    }

    const list = (rows: typeof elsewhere, withBatch = false): string =>
      rows
        .map(
          (balance) =>
            `${at(balance.branch.name, balance.godown.name)}` +
            (withBatch && balance.batchNo ? ` · ${balance.batchNo}` : '') +
            ` has ${say(Number(balance.qtyBoxes))}`,
        )
        .join(', ');

    // Three answers, in the order the remedy gets more expensive: it is right here under
    // another batch; it is in another godown of this branch; it is in another branch.
    const sameGodown = elsewhere.filter((balance) => balance.godownId === line.godownId);
    if (sameGodown.length > 0) {
      const pinned = [line.batchNo && `batch ${line.batchNo}`, line.shade && `shade ${line.shade}`]
        .filter(Boolean)
        .join(' and ');
      return (
        `${here}. It is in that same godown under ${list(sameGodown, true)}` +
        (pinned
          ? ` — the line is pinned to ${pinned}. Clear that, or pick the batch that has stock.`
          : ' — pick that batch on the line.')
      );
    }

    const sameBranch = elsewhere.filter((balance) => balance.branchId === branchId);
    if (sameBranch.length > 0) {
      return `${here}. ${list(sameBranch)} — change the godown on the line.`;
    }

    return (
      `${here}. It is in another branch: ${list(elsewhere)}` +
      ' — transfer it in, or raise the order there instead.'
    );
  }

  /**
   * Whether this order line has already been invoiced by someone else.
   *
   * Returns the sentence to show, or null when the order is not the reason. Only posted
   * invoices count: a rival draft has taken nothing yet, and both can still be fixed.
   */
  private async orderLineAlreadyInvoiced(
    tx: Pick<PrismaService, 'salesOrderLine' | 'salesInvoiceLine'>,
    salesOrderLineId: UUID,
    thisInvoiceId: UUID,
  ): Promise<string | null> {
    const orderLine = await tx.salesOrderLine.findFirst({
      where: { id: salesOrderLineId },
      select: {
        qtyBoxes: true,
        invoicedQtyBoxes: true,
        product: { select: { sku: true, piecesPerBox: true, sqftPerBox: true, baseUom: true } },
      },
    });
    if (!orderLine) return null;

    const pending = round3(Number(orderLine.qtyBoxes) - Number(orderLine.invoicedQtyBoxes));
    if (pending > 0) return null;

    const others = await tx.salesInvoiceLine.findMany({
      where: {
        salesOrderLineId,
        salesInvoice: { deletedAt: null, status: 'POSTED', id: { not: thisInvoiceId } },
      },
      select: { salesInvoice: { select: { invoiceNumber: true } } },
      take: 3,
    });
    const numbers = [...new Set(others.map((row) => row.salesInvoice.invoiceNumber))];
    const say = formatStockQuantity(
      Number(orderLine.qtyBoxes),
      orderLine.product.piecesPerBox,
      Number(orderLine.product.sqftPerBox ?? 0),
      orderLine.product.baseUom,
    );

    return (
      `${orderLine.product.sku}: all ${say} on this order has already been invoiced` +
      (numbers.length > 0 ? ` on ${numbers.join(', ')}` : '') +
      '. This draft is a duplicate — delete it, or reduce it to what is still pending.'
    );
  }

  async assertGodownsInBranch(branchId: UUID, godownIds: UUID[]): Promise<void> {
    if (godownIds.length === 0) return;
    const godowns = await this.prisma.godown.findMany({
      where: { id: { in: [...new Set(godownIds)] } },
      select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
    });

    const missing = godowns.filter((godown) => godown.branchId !== branchId);
    if (missing.length === 0) return;

    const invoiceBranch = await this.prisma.branch.findFirst({
      where: { id: branchId },
      select: { name: true },
    });
    const where = missing
      .map((godown) => `${godown.name} belongs to ${godown.branch.name}`)
      .join(', ');

    throw new ValidationError(
      `This invoice is for ${invoiceBranch?.name ?? 'another branch'}, but ${where}. ` +
        'A branch can only invoice its own stock — use Raise invoices on the order to cut ' +
        'one invoice per supplying branch.',
    );
  }

  private async godownNames(row: Row): Promise<Map<string, string>> {
    const ids = [...new Set(row.lines.map((line) => line.godownId))];
    if (ids.length === 0) return new Map();
    const godowns = await this.prisma.godown.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(godowns.map((godown) => [godown.id, godown.name]));
  }

  async nextInvoiceNumber(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'SALES_INVOICE', branchId ?? null);
  }

  async list(
    query: PaginationQuery,
    filter: SalesInvoiceFilter,
  ): Promise<Paginated<SalesInvoiceItem>> {
    const where: Prisma.SalesInvoiceWhereInput = {
      deletedAt: null,
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.salesOrderId ? { salesOrderId: filter.salesOrderId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
              { customerName: { contains: query.search, mode: 'insensitive' } },
              { customerMobile: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.salesInvoice.findMany({
        where,
        include,
        orderBy: { invoiceDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => toItem(row, false)),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: UUID): Promise<SalesInvoiceItem | null> {
    const row = await this.prisma.salesInvoice.findFirst({
      where: { id, deletedAt: null },
      include,
    });
    return row ? toItem(row, true, await this.godownNames(row)) : null;
  }

  async create(
    number: string,
    data: SalesInvoiceWriteData,
    createdBy: UUID,
  ): Promise<SalesInvoiceItem> {
    const row = await this.prisma.salesInvoice.create({
      data: {
        invoiceNumber: number,
        salesOrderId: data.salesOrderId,
        customerId: data.customerId,
        branchId: data.branchId,
        customerName: data.customerName,
        customerAddress: data.customerAddress,
        customerMobile: data.customerMobile,
        customerGstin: data.customerGstin,
        placeOfSupply: data.placeOfSupply,
        salesmanUserId: data.salesmanUserId,
        salesmanName: data.salesmanName,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        remarks: data.remarks,
        subTotal: data.subTotal,
        cgstAmount: data.cgstAmount,
        sgstAmount: data.sgstAmount,
        igstAmount: data.igstAmount,
        gstAmount: data.gstAmount,
        freightCharge: data.freightCharge,
        unloadingCharge: data.unloadingCharge,
        loadingCharge: data.loadingCharge,
        roundOff: data.roundOff,
        grandTotal: data.grandTotal,
        createdBy,
        lines: { create: data.lines },
      },
      include,
    });
    return toItem(row, true, await this.godownNames(row));
  }

  async update(
    id: UUID,
    version: number,
    data: SalesInvoiceWriteData,
    updatedBy: UUID,
  ): Promise<SalesInvoiceItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.salesInvoice.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError('Sales invoice not found');
      if (existing.status !== 'DRAFT') {
        throw new ValidationError('Only draft invoices can be edited');
      }
      const updated = await tx.salesInvoice.updateMany({
        where: { id, version },
        data: {
          customerId: data.customerId,
          branchId: data.branchId,
          customerName: data.customerName,
          customerAddress: data.customerAddress,
          customerMobile: data.customerMobile,
          customerGstin: data.customerGstin,
          placeOfSupply: data.placeOfSupply,
          salesmanUserId: data.salesmanUserId,
          salesmanName: data.salesmanName,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          remarks: data.remarks,
          subTotal: data.subTotal,
          cgstAmount: data.cgstAmount,
          sgstAmount: data.sgstAmount,
          igstAmount: data.igstAmount,
          gstAmount: data.gstAmount,
          freightCharge: data.freightCharge,
          unloadingCharge: data.unloadingCharge,
          loadingCharge: data.loadingCharge,
          roundOff: data.roundOff,
          grandTotal: data.grandTotal,
          updatedBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Invoice was modified by someone else. Reload and retry.');
      }
      await tx.salesInvoiceLine.deleteMany({ where: { salesInvoiceId: id } });
      await tx.salesInvoiceLine.createMany({
        data: data.lines.map((line) => ({ ...line, salesInvoiceId: id })),
      });
      return tx.salesInvoice.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true, await this.godownNames(row));
  }

  /**
   * Posting is the moment the goods actually leave: reservations are consumed, SALE
   * movements written, balances reduced and the order draw-down recorded. The balance
   * read and write sit in the same transaction so two tills cannot oversell the same box.
   */
  async post(id: UUID, version: number, postedBy: UUID): Promise<SalesInvoiceItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findFirst({
        where: { id, deletedAt: null },
        include,
      });
      if (!invoice) throw new NotFoundError('Sales invoice not found');
      if (invoice.status === 'POSTED') throw new ValidationError('Invoice is already posted');
      if (invoice.status === 'CANCELLED') throw new ValidationError('Invoice is cancelled');
      if (invoice.lines.length === 0) throw new ValidationError('This invoice has no lines');

      for (const line of invoice.lines) {
        const qty = Number(line.qtyBoxes);
        if (qty <= 0) continue;

        // A dimension the line does not name is not a filter.
        //
        // Availability was measured across gates, batches and shades; a line that names
        // only a godown means "from that godown", not "from the row whose gate, batch and
        // shade are all literally null". Matching on nulls is how a godown holding 138
        // pieces at a gate reports zero — the balance is there, the exact key is not.
        const candidates = await tx.stockBalance.findMany({
          where: {
            productId: line.productId,
            branchId: invoice.branchId,
            godownId: line.godownId,
            ...(line.gateId ? { gateId: line.gateId } : {}),
            ...(line.batchNo ? { batchNo: line.batchNo } : {}),
            ...(line.shade ? { shade: line.shade } : {}),
            qtyBoxes: { gt: 0 },
          },
          select: { id: true, qtyBoxes: true, gateId: true, batchNo: true, shade: true },
          // Oldest batch leaves first, which is what a godown does by hand. Rows with no
          // batch sort last rather than first: named stock is the stock someone is
          // watching the age of.
          orderBy: [{ batchNo: 'asc' }, { gateId: 'asc' }],
        });

        const available = round3(
          candidates.reduce((sum, balance) => sum + Number(balance.qtyBoxes), 0),
        );
        if (available < qty) {
          // A sibling invoice on the same order is the usual culprit, not the godown.
          // Saying "MAIN has 0" when another invoice already took the goods is true and
          // sends the reader hunting for stock that was never missing.
          const takenByOrder = line.salesOrderLineId
            ? await this.orderLineAlreadyInvoiced(tx, line.salesOrderLineId, id)
            : null;
          if (takenByOrder) throw new ValidationError(takenByOrder);
          throw new ValidationError(
            await this.shortStockMessage(tx, invoice.branchId, line, available, qty),
          );
        }

        // Draw across the rows that actually hold it, writing one movement per row so the
        // ledger keeps the real gate, batch and shade rather than the line's blanks.
        let outstanding = qty;
        for (const balance of candidates) {
          if (outstanding <= 0) break;
          const take = round3(Math.min(Number(balance.qtyBoxes), outstanding));
          if (take <= 0) continue;
          outstanding = round3(outstanding - take);

          await tx.stockMovement.create({
            data: {
              productId: line.productId,
              branchId: invoice.branchId,
              godownId: line.godownId,
              gateId: balance.gateId,
              batchNo: balance.batchNo,
              shade: balance.shade,
              type: 'SALE',
              direction: 'OUT',
              qtyBoxes: take,
              refType: 'SALES_INVOICE',
              refId: invoice.id,
              refNumber: invoice.invoiceNumber,
              remarks: invoice.remarks,
              movementDate: invoice.invoiceDate,
              createdBy: postedBy,
            },
          });

          await tx.stockBalance.update({
            where: { id: balance.id },
            data: { qtyBoxes: { decrement: take } },
          });
        }

        // Draw the quantity down against the order line and release its hold.
        if (line.salesOrderLineId) {
          await tx.salesOrderLine.update({
            where: { id: line.salesOrderLineId },
            data: { invoicedQtyBoxes: { increment: qty } },
          });
          await tx.stockReservation.updateMany({
            where: {
              salesOrderLineId: line.salesOrderLineId,
              godownId: line.godownId,
              batchNo: line.batchNo,
              shade: line.shade,
              status: 'ACTIVE',
            },
            data: { status: 'CONSUMED', closedAt: new Date(), closedBy: postedBy },
          });
        }
      }

      // Freeze what the goods cost, on the line that sold them.
      //
      // Taken at posting rather than read later from the product, because the product's
      // landing cost moves with every purchase — working margin out from it would mean a
      // delivery next month silently restating last month's profit. Every other figure on
      // an invoice is frozen here for the same reason.
      const costs = await tx.product.findMany({
        where: { id: { in: [...new Set(invoice.lines.map((line) => line.productId))] } },
        select: { id: true, landingCost: true },
      });
      for (const product of costs) {
        if (product.landingCost === null) continue;
        await tx.salesInvoiceLine.updateMany({
          where: { salesInvoiceId: id, productId: product.id },
          // costEstimated is cleared as well: a line posted now has a cost captured at
          // posting, even if a backfill had already put an estimate there.
          data: { unitCost: product.landingCost, costEstimated: false },
        });
      }

      const updated = await tx.salesInvoice.updateMany({
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
        throw new ConflictError('Invoice was modified by someone else. Reload and retry.');
      }

      if (invoice.salesOrderId) {
        await rollUpOrderStatus(tx, invoice.salesOrderId, postedBy);
      }

      return tx.salesInvoice.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true, await this.godownNames(row));
  }

  /** Cancelling a posted invoice puts the stock back and undoes the order draw-down. */
  async cancel(
    id: UUID,
    version: number,
    reason: string,
    cancelledBy: UUID,
  ): Promise<SalesInvoiceItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findFirst({
        where: { id, deletedAt: null },
        include,
      });
      if (!invoice) throw new NotFoundError('Sales invoice not found');
      if (invoice.status === 'CANCELLED') throw new ValidationError('Invoice is already cancelled');
      if (Number(invoice.paidAmount) > 0) {
        throw new ValidationError(
          'Money has been collected against this invoice; reverse the collection first',
        );
      }

      if (invoice.status === 'POSTED') {
        for (const line of invoice.lines) {
          const qty = Number(line.qtyBoxes);
          if (qty <= 0) continue;

          await tx.stockMovement.create({
            data: {
              productId: line.productId,
              branchId: invoice.branchId,
              godownId: line.godownId,
              gateId: line.gateId,
              batchNo: line.batchNo,
              shade: line.shade,
              type: 'SALE_RETURN',
              direction: 'IN',
              qtyBoxes: qty,
              refType: 'SALES_INVOICE_CANCEL',
              refId: invoice.id,
              refNumber: invoice.invoiceNumber,
              reason,
              movementDate: new Date(),
              createdBy: cancelledBy,
            },
          });

          // The stock key allows nulls, so it cannot be used as a unique upsert target.
          const existing = await tx.stockBalance.findFirst({
            where: {
              productId: line.productId,
              branchId: invoice.branchId,
              godownId: line.godownId,
              gateId: line.gateId,
              batchNo: line.batchNo,
              shade: line.shade,
            },
            select: { id: true },
          });
          if (existing) {
            await tx.stockBalance.update({
              where: { id: existing.id },
              data: { qtyBoxes: { increment: qty } },
            });
          } else {
            await tx.stockBalance.create({
              data: {
                productId: line.productId,
                branchId: invoice.branchId,
                godownId: line.godownId,
                gateId: line.gateId,
                batchNo: line.batchNo,
                shade: line.shade,
                qtyBoxes: qty,
              },
            });
          }

          if (line.salesOrderLineId) {
            await tx.salesOrderLine.update({
              where: { id: line.salesOrderLineId },
              data: { invoicedQtyBoxes: { decrement: qty } },
            });
          }
        }
      }

      const updated = await tx.salesInvoice.updateMany({
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
        throw new ConflictError('Invoice was modified by someone else. Reload and retry.');
      }

      if (invoice.salesOrderId) {
        await rollUpOrderStatus(tx, invoice.salesOrderId, cancelledBy);
      }

      return tx.salesInvoice.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true, await this.godownNames(row));
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.salesInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Sales invoice not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError('Only draft invoices can be deleted; cancel posted ones instead');
    }
    await this.prisma.salesInvoice.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy, version: { increment: 1 } },
    });
  }

  async printData(id: UUID): Promise<SalesInvoicePrintData | null> {
    const row = await this.prisma.salesInvoice.findFirst({
      where: { id, deletedAt: null },
      include: { ...include, branch: { include: { company: true } } },
    });
    if (!row) return null;

    const [terms, declaration] = await Promise.all([
      this.prisma.setting.findUnique({ where: { key: 'invoice.terms' } }),
      this.prisma.setting.findUnique({ where: { key: 'invoice.declaration' } }),
    ]);

    return {
      invoice: toItem(row as unknown as Row, true, await this.godownNames(row as unknown as Row)),
      company: toPartyBlock(row.branch.company),
      branch: toPartyBlock({ ...row.branch, legalName: null }),
      terms: toLines(terms?.value),
      declaration: declaration?.value?.trim() || null,
    };
  }

  async billingParties(customerId: UUID, branchId: UUID): Promise<BillingParties> {
    const [customer, branch, posted] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { id: customerId, deletedAt: null },
        select: {
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          phone: true,
          gstin: true,
          stateCode: true,
          isActive: true,
          creditLimit: true,
          creditDays: true,
        },
      }),
      this.prisma.branch.findFirst({
        where: { id: branchId, deletedAt: null },
        select: { stateCode: true },
      }),
      this.prisma.salesInvoice.findMany({
        where: { customerId, deletedAt: null, status: 'POSTED' },
        select: { grandTotal: true, paidAmount: true },
      }),
    ]);
    if (!customer) throw new ValidationError('Customer not found');
    if (!branch) throw new ValidationError('Branch not found');

    const outstanding = posted.reduce(
      (sum, invoice) => sum + (Number(invoice.grandTotal) - Number(invoice.paidAmount)),
      0,
    );

    return {
      customerName: customer.name,
      customerAddress:
        [customer.addressLine1, customer.addressLine2, customer.city].filter(Boolean).join(', ') ||
        null,
      customerMobile: customer.phone,
      customerGstin: customer.gstin,
      customerStateCode: customer.stateCode,
      customerIsActive: customer.isActive,
      creditLimit: Number(customer.creditLimit),
      creditDays: customer.creditDays,
      outstanding: round2(outstanding),
      branchStateCode: branch.stateCode,
    };
  }

  /**
   * Cost and the branch floor for a set of products.
   *
   * The same query the quotation repository runs. Duplicated rather than shared through a
   * cross-module import: sales invoices and quotations are separate aggregates, and one
   * reaching into the other's repository is the kind of coupling that makes either
   * impossible to change later.
   */
  async priceHints(branchId: UUID, productIds: UUID[]): Promise<Map<UUID, ProductPriceHint>> {
    if (productIds.length === 0) return new Map();
    const [products, prices] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
        select: {
          id: true,
          sku: true,
          name: true,
          sizeMm: true,
          piecesPerBox: true,
          baseUom: true,
          mrp: true,
          gstRate: true,
          landingCost: true,
        },
      }),
      this.prisma.productBranchPrice.findMany({
        where: { branchId, productId: { in: productIds } },
      }),
    ]);
    const priceByProduct = new Map(prices.map((p) => [p.productId, p]));

    return new Map(
      products.map((product) => {
        const price = priceByProduct.get(product.id);
        return [
          product.id,
          {
            productId: product.id,
            sku: product.sku,
            productName: product.name,
            sizeMm: product.sizeMm,
            piecesPerBox: product.piecesPerBox,
            baseUom: product.baseUom,
            mrp: product.mrp === null ? null : Number(product.mrp),
            gstRate: Number(product.gstRate),
            landingCost: product.landingCost === null ? null : Number(product.landingCost),
            displayPrice: price ? Number(price.displayPrice) : null,
            minSellingPrice: price ? Number(price.minSellingPrice) : null,
            sellingPrice: price ? Number(price.sellingPrice) : null,
          },
        ];
      }),
    );
  }

  async salesmanName(userId: UUID): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : null;
  }

  /**
   * What is left to invoice on an order.
   *
   * Drafts count against it as well as posted invoices. A draft reserves nothing, so two
   * drafts claiming the same 50 boxes both look valid until one posts and the other dies
   * at the counter blaming an empty godown — which is technically true and completely
   * misleading. Counting the draft is what stops the second one being created.
   *
   * `exceptInvoiceId` excludes a draft from its own calculation, so editing one does not
   * see itself as a rival claim.
   */
  async invoiceableLines(
    salesOrderId: UUID,
    exceptInvoiceId?: UUID,
  ): Promise<InvoiceableLine[]> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: salesOrderId, deletedAt: null },
      include: {
        lines: {
          include: {
            product: {
              select: {
                sku: true,
                name: true,
                sizeMm: true,
                piecesPerBox: true,
                baseUom: true,
                hsnCode: true,
              },
            },
            reservations: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    if (!order) throw new NotFoundError('Sales order not found');
    if (order.status === 'CANCELLED') throw new ValidationError('This order is cancelled');
    if (order.status === 'DRAFT') {
      throw new ValidationError('Confirm the order before invoicing it');
    }

    const godownIds = [
      ...new Set(order.lines.flatMap((line) => line.reservations.map((r) => r.godownId))),
    ];
    const godowns = await this.prisma.godown.findMany({
      where: { id: { in: godownIds } },
      select: { id: true, name: true },
    });
    const nameByGodown = new Map(godowns.map((godown) => [godown.id, godown.name]));

    const branchIds = [
      ...new Set(order.lines.flatMap((line) => line.reservations.map((r) => r.branchId))),
    ];
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    });
    const nameByBranch = new Map(branches.map((branch) => [branch.id, branch.name]));

    const drafted = await this.prisma.salesInvoiceLine.groupBy({
      by: ['salesOrderLineId'],
      where: {
        salesOrderLineId: { in: order.lines.map((line) => line.id) },
        salesInvoice: {
          salesOrderId,
          deletedAt: null,
          status: 'DRAFT',
          ...(exceptInvoiceId ? { id: { not: exceptInvoiceId } } : {}),
        },
      },
      _sum: { qtyBoxes: true },
    });
    const draftedByLine = new Map(
      drafted.map((row) => [row.salesOrderLineId, Number(row._sum.qtyBoxes ?? 0)]),
    );

    return order.lines.map((line) => {
      const orderedQtyBoxes = Number(line.qtyBoxes);
      const invoicedQtyBoxes = Number(line.invoicedQtyBoxes);
      const draftedQtyBoxes = round3(draftedByLine.get(line.id) ?? 0);
      return {
        salesOrderLineId: line.id,
        productId: line.productId,
        sku: line.product.sku,
        productName: line.product.name,
        sizeMm: line.product.sizeMm,
        piecesPerBox: line.product.piecesPerBox,
        baseUom: line.product.baseUom,
        hsnCode: line.product.hsnCode,
        orderedQtyBoxes,
        invoicedQtyBoxes,
        draftedQtyBoxes,
        pendingQtyBoxes: round3(
          Math.max(orderedQtyBoxes - invoicedQtyBoxes - draftedQtyBoxes, 0),
        ),
        rate: Number(line.rate),
        discountPct: Number(line.discountPct),
        gstRate: Number(line.gstRate),
        mrp: line.mrp === null ? null : Number(line.mrp),
        sources: line.reservations.map((reservation) => ({
          branchId: reservation.branchId,
          branchName: nameByBranch.get(reservation.branchId) ?? '',
          godownId: reservation.godownId,
          godownName: nameByGodown.get(reservation.godownId) ?? 'Unknown godown',
          batchNo: reservation.batchNo,
          shade: reservation.shade,
          qtyBoxes: Number(reservation.qtyBoxes),
        })),
      };
    });
  }
}

/**
 * Recomputes an order's status from what its lines have actually been invoiced for, so
 * posting and cancelling both land on the right answer without tracking it by hand.
 */
async function rollUpOrderStatus(
  tx: Prisma.TransactionClient,
  salesOrderId: string,
  actorId: string,
): Promise<void> {
  const order = await tx.salesOrder.findFirst({
    where: { id: salesOrderId },
    include: { lines: true },
  });
  if (!order || order.status === 'CANCELLED') return;

  const ordered = order.lines.reduce((sum, line) => sum + Number(line.qtyBoxes), 0);
  const invoiced = order.lines.reduce((sum, line) => sum + Number(line.invoicedQtyBoxes), 0);

  const status =
    invoiced <= 0 ? 'CONFIRMED' : invoiced + 0.0005 >= ordered ? 'INVOICED' : 'PARTIALLY_INVOICED';

  if (status !== order.status) {
    await tx.salesOrder.update({
      where: { id: salesOrderId },
      data: { status, updatedBy: actorId, version: { increment: 1 } },
    });
  }
}
