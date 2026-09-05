import { Injectable } from '@nestjs/common';
import type { ProfitGrouping, ProfitReport, ProfitRow } from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { ProfitFilter, ProfitRepository } from '../domain/profit.repository';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const startOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

/** A row being accumulated, before the percentages are worked out. */
interface Bucket {
  key: string;
  label: string;
  subLabel: string | null;
  revenue: number;
  cost: number;
  qtyBoxes: number;
  revenueWithoutCost: number;
  revenueEstimatedCost: number;
}

@Injectable()
export class PrismaProfitRepository implements ProfitRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Margin over a period, grouped four ways.
   *
   * Revenue is the goods value before GST. Freight, loading and unloading are excluded on
   * purpose: they are recovered costs rather than trading margin, and folding them in
   * makes a delivery look like a sale.
   *
   * Cost comes from the figure frozen on each line when the invoice was posted, never
   * from the product's landing cost today — otherwise a delivery arriving next month
   * would restate last month's profit.
   */
  async report(grouping: ProfitGrouping, filter: ProfitFilter): Promise<ProfitReport> {
    const from = startOfDay(new Date(filter.from));
    const to = endOfDay(new Date(filter.to));

    const lines = await this.prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: {
          deletedAt: null,
          // Only posted invoices are sales. A draft is a proposal and a cancelled one
          // never happened; counting either would report profit on goods still in the
          // godown.
          status: 'POSTED',
          invoiceDate: { gte: from, lte: to },
          ...(filter.branchId ? { branchId: filter.branchId } : {}),
          ...(filter.salesmanUserId ? { salesmanUserId: filter.salesmanUserId } : {}),
        },
        ...(filter.productId ? { productId: filter.productId } : {}),
      },
      select: {
        productId: true,
        qtyBoxes: true,
        lineSubTotal: true,
        unitCost: true,
        costEstimated: true,
        product: { select: { sku: true, name: true, brand: { select: { name: true } } } },
        salesInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            customerName: true,
            branchId: true,
            branch: { select: { name: true } },
            salesmanUserId: true,
            salesmanName: true,
          },
        },
      },
    });

    const buckets = new Map<string, Bucket>();
    let linesWithoutCost = 0;
    let linesEstimated = 0;

    for (const line of lines) {
      const revenue = round2(Number(line.lineSubTotal));
      const qtyBoxes = round3(Number(line.qtyBoxes));
      const hasCost = line.unitCost !== null;
      const cost = hasCost ? round2(Number(line.unitCost) * qtyBoxes) : 0;
      if (!hasCost) linesWithoutCost += 1;
      if (hasCost && line.costEstimated) linesEstimated += 1;

      const { key, label, subLabel } = this.bucketOf(grouping, line);
      const bucket = buckets.get(key) ?? {
        key,
        label,
        subLabel,
        revenue: 0,
        cost: 0,
        qtyBoxes: 0,
        revenueWithoutCost: 0,
        revenueEstimatedCost: 0,
      };

      bucket.revenue = round2(bucket.revenue + revenue);
      bucket.cost = round2(bucket.cost + cost);
      bucket.qtyBoxes = round3(bucket.qtyBoxes + qtyBoxes);
      if (!hasCost) bucket.revenueWithoutCost = round2(bucket.revenueWithoutCost + revenue);
      if (hasCost && line.costEstimated) {
        bucket.revenueEstimatedCost = round2(bucket.revenueEstimatedCost + revenue);
      }
      buckets.set(key, bucket);
    }

    const rows: ProfitRow[] = [...buckets.values()]
      .map((bucket) => {
        const margin = round2(bucket.revenue - bucket.cost);
        return {
          ...bucket,
          margin,
          marginPct: bucket.revenue > 0 ? round2((margin / bucket.revenue) * 100) : 0,
        };
      })
      // Thinnest margin first. A report read top-down should start with what needs
      // attention, not with whatever sold most.
      .sort((a, b) => a.marginPct - b.marginPct);

    const revenue = round2(rows.reduce((sum, row) => sum + row.revenue, 0));
    const cost = round2(rows.reduce((sum, row) => sum + row.cost, 0));
    const margin = round2(revenue - cost);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      grouping,
      rows,
      revenue,
      cost,
      margin,
      marginPct: revenue > 0 ? round2((margin / revenue) * 100) : 0,
      revenueWithoutCost: round2(rows.reduce((sum, row) => sum + row.revenueWithoutCost, 0)),
      linesWithoutCost,
      revenueEstimatedCost: round2(
        rows.reduce((sum, row) => sum + row.revenueEstimatedCost, 0),
      ),
      linesEstimated,
    };
  }

  /** Which row a line belongs to, and what that row is called. */
  private bucketOf(
    grouping: ProfitGrouping,
    line: {
      productId: string;
      product: { sku: string; name: string; brand: { name: string } };
      salesInvoice: {
        id: string;
        invoiceNumber: string;
        invoiceDate: Date;
        customerName: string;
        branchId: string;
        branch: { name: string };
        salesmanUserId: string | null;
        salesmanName: string | null;
      };
    },
  ): { key: string; label: string; subLabel: string | null } {
    switch (grouping) {
      case 'PRODUCT':
        return {
          key: line.productId,
          label: `${line.product.sku} · ${line.product.name}`,
          subLabel: line.product.brand.name,
        };
      case 'BRANCH':
        return {
          key: line.salesInvoice.branchId,
          label: line.salesInvoice.branch.name,
          subLabel: null,
        };
      case 'SALESMAN':
        // Invoices raised without a salesman are grouped together rather than dropped —
        // unattributed sales are a real category, and hiding them would make the ones
        // that are attributed look like the whole picture.
        return {
          key: line.salesInvoice.salesmanUserId ?? 'unattributed',
          label: line.salesInvoice.salesmanName ?? 'No salesman recorded',
          subLabel: null,
        };
      case 'INVOICE':
      default:
        return {
          key: line.salesInvoice.id,
          label: line.salesInvoice.invoiceNumber,
          subLabel: line.salesInvoice.customerName,
        };
    }
  }
}
