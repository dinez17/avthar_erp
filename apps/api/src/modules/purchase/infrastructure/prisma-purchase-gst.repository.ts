import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isInterStateSupply, splitGst } from '@tiles-erp/shared';
import type {
  PurchaseGstHsnRow,
  PurchaseGstRateRow,
  PurchaseGstSummary,
  PurchaseGstSupplierRow,
  TaxPosition,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { addTax, emptyLeg, netTaxPosition } from '../application/tax-position';
import type {
  PurchaseGstRepository,
  PurchaseGstWindow,
} from '../domain/purchase-gst.repository';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * The invoices a period counts: posted only.
 *
 * A draft is not a purchase and a cancelled one never happened, so neither carries input
 * credit — the same rule the outward summary applies to sales.
 */
const posted = (window: PurchaseGstWindow): Prisma.PurchaseInvoiceWhereInput => ({
  deletedAt: null,
  status: 'POSTED',
  invoiceDate: { gte: window.from, lte: window.to },
  ...(window.branchId ? { branchId: window.branchId } : {}),
});

const invoiceInclude = {
  supplier: { select: { id: true, name: true, gstin: true, stateCode: true } },
  branch: { select: { stateCode: true } },
  lines: {
    include: { product: { select: { hsnCode: true, id: true } } },
  },
} satisfies Prisma.PurchaseInvoiceInclude;

@Injectable()
export class PrismaPurchaseGstRepository implements PurchaseGstRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inward supplies for the period.
   *
   * A purchase invoice stores its tax as one figure, so the CGST/SGST/IGST split is
   * derived here from where the supplier is against where the branch is — using the same
   * `splitGst` and `isInterStateSupply` the sales side uses, so a purchase and a sale
   * across the same state line are split identically.
   */
  async summary(window: PurchaseGstWindow): Promise<PurchaseGstSummary> {
    const invoices = await this.prisma.purchaseInvoice.findMany({
      where: posted(window),
      include: invoiceInclude,
    });

    const byRate = new Map<number, PurchaseGstRateRow>();
    const byHsn = new Map<string, PurchaseGstHsnRow & { products: Set<string> }>();
    const bySupplier = new Map<string, PurchaseGstSupplierRow>();

    let taxableValue = 0;
    let invoiceValue = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let ineligibleTax = 0;

    for (const invoice of invoices) {
      const interState = isInterStateSupply(
        invoice.branch.stateCode,
        invoice.supplier.stateCode,
      );
      // No GSTIN, no credit: the tax was paid but cannot be set off.
      const claimable = Boolean(invoice.supplier.gstin?.trim());

      invoiceValue = round2(invoiceValue + Number(invoice.grandTotal));

      const supplier = bySupplier.get(invoice.supplierId) ?? {
        supplierId: invoice.supplierId,
        supplierName: invoice.supplier.name,
        gstin: invoice.supplier.gstin,
        invoiceCount: 0,
        taxableValue: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalTax: 0,
        isInterState: interState,
      };
      supplier.invoiceCount += 1;

      // One rate row per invoice-and-rate, so an invoice touching two rates counts once
      // in each — the same convention the outward summary follows.
      const ratesSeen = new Set<number>();

      for (const line of invoice.lines) {
        const rate = Number(line.gstRate);
        const lineTaxable = Number(line.lineSubTotal);
        const split = splitGst(Number(line.lineGst), interState);

        taxableValue = round2(taxableValue + lineTaxable);
        cgstAmount = round2(cgstAmount + split.cgst);
        sgstAmount = round2(sgstAmount + split.sgst);
        igstAmount = round2(igstAmount + split.igst);
        if (!claimable) ineligibleTax = round2(ineligibleTax + split.total);

        const rateRow = byRate.get(rate) ?? {
          gstRate: rate,
          invoiceCount: 0,
          taxableValue: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          totalTax: 0,
        };
        if (!ratesSeen.has(rate)) {
          rateRow.invoiceCount += 1;
          ratesSeen.add(rate);
        }
        rateRow.taxableValue = round2(rateRow.taxableValue + lineTaxable);
        rateRow.cgstAmount = round2(rateRow.cgstAmount + split.cgst);
        rateRow.sgstAmount = round2(rateRow.sgstAmount + split.sgst);
        rateRow.igstAmount = round2(rateRow.igstAmount + split.igst);
        rateRow.totalTax = round2(rateRow.totalTax + split.total);
        byRate.set(rate, rateRow);

        // Products with no HSN are grouped visibly rather than dropped: it is a gap to
        // fix before filing, not a rounding difference.
        const hsn = line.product.hsnCode?.trim() || 'Not set';
        const hsnRow = byHsn.get(hsn) ?? {
          hsnCode: hsn,
          productCount: 0,
          qtyBoxes: 0,
          taxableValue: 0,
          totalTax: 0,
          products: new Set<string>(),
        };
        hsnRow.products.add(line.productId);
        hsnRow.qtyBoxes = round3(hsnRow.qtyBoxes + Number(line.qtyBoxes));
        hsnRow.taxableValue = round2(hsnRow.taxableValue + lineTaxable);
        hsnRow.totalTax = round2(hsnRow.totalTax + split.total);
        byHsn.set(hsn, hsnRow);

        supplier.taxableValue = round2(supplier.taxableValue + lineTaxable);
        supplier.cgstAmount = round2(supplier.cgstAmount + split.cgst);
        supplier.sgstAmount = round2(supplier.sgstAmount + split.sgst);
        supplier.igstAmount = round2(supplier.igstAmount + split.igst);
        supplier.totalTax = round2(supplier.totalTax + split.total);
      }

      bySupplier.set(invoice.supplierId, supplier);
    }

    return {
      fromDate: window.from.toISOString(),
      toDate: window.to.toISOString(),
      invoiceCount: invoices.length,
      taxableValue,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalTax: round2(cgstAmount + sgstAmount + igstAmount),
      invoiceValue,
      ineligibleTax,
      byRate: [...byRate.values()].sort((a, b) => a.gstRate - b.gstRate),
      byHsn: [...byHsn.values()]
        .map(({ products, ...row }) => ({ ...row, productCount: products.size }))
        .sort((a, b) => b.taxableValue - a.taxableValue),
      bySupplier: [...bySupplier.values()].sort((a, b) => b.totalTax - a.totalTax),
    };
  }

  /**
   * Output tax against input credit.
   *
   * Sales carry their own CGST/SGST/IGST columns, written when the invoice was raised, so
   * the outward side is read rather than derived. The inward side is derived, as above.
   */
  async position(window: PurchaseGstWindow): Promise<TaxPosition> {
    const [sales, purchases] = await Promise.all([
      this.prisma.salesInvoice.aggregate({
        where: {
          deletedAt: null,
          status: 'POSTED',
          invoiceDate: { gte: window.from, lte: window.to },
          ...(window.branchId ? { branchId: window.branchId } : {}),
        },
        _sum: { cgstAmount: true, sgstAmount: true, igstAmount: true },
      }),
      this.prisma.purchaseInvoice.findMany({
        where: posted(window),
        select: {
          gstAmount: true,
          supplier: { select: { gstin: true, stateCode: true } },
          branch: { select: { stateCode: true } },
        },
      }),
    ]);

    const output = addTax(
      emptyLeg(),
      Number(sales._sum.cgstAmount ?? 0),
      Number(sales._sum.sgstAmount ?? 0),
      Number(sales._sum.igstAmount ?? 0),
    );

    let input = emptyLeg();
    let ineligible = 0;
    for (const invoice of purchases) {
      const split = splitGst(
        Number(invoice.gstAmount),
        isInterStateSupply(invoice.branch.stateCode, invoice.supplier.stateCode),
      );
      // Tax from a supplier with no GSTIN is a cost, not a credit, so it is reported
      // beside the position rather than set off inside it.
      if (invoice.supplier.gstin?.trim()) {
        input = addTax(input, split.cgst, split.sgst, split.igst);
      } else {
        ineligible = round2(ineligible + split.total);
      }
    }

    return netTaxPosition(window.from, window.to, output, input, ineligible);
  }
}
