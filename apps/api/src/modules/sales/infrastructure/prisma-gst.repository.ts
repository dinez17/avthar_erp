import { Injectable } from '@nestjs/common';
import type {
  Gstr1Return,
  GstHsnRow,
  GstPlaceRow,
  GstRateRow,
  GstSummary,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { GstRepository, GstWindow } from '../domain/gst.repository';
import { PrismaGstr1Repository } from './prisma-gstr1.repository';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

@Injectable()
export class PrismaGstRepository implements GstRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gstr1: PrismaGstr1Repository,
  ) {}

  returnData(window: GstWindow): Promise<Gstr1Return> {
    return this.gstr1.returnData(window);
  }

  /**
   * Outward supplies for the period. Only POSTED invoices count: a draft is not a supply
   * and a cancelled one never happened, so neither belongs in a return.
   */
  async summary(window: GstWindow): Promise<GstSummary> {
    const where = {
      deletedAt: null,
      status: 'POSTED' as const,
      invoiceDate: { gte: window.from, lte: window.to },
      ...(window.branchId ? { branchId: window.branchId } : {}),
    };

    const invoices = await this.prisma.salesInvoice.findMany({
      where,
      select: {
        id: true,
        placeOfSupply: true,
        subTotal: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        gstAmount: true,
        grandTotal: true,
        branch: { select: { stateCode: true } },
        lines: {
          select: {
            hsnCode: true,
            productId: true,
            qtyBoxes: true,
            gstRate: true,
            lineSubTotal: true,
            lineCgst: true,
            lineSgst: true,
            lineIgst: true,
            lineGst: true,
          },
        },
      },
    });

    const byRate = new Map<number, GstRateRow & { invoices: Set<string> }>();
    const byHsn = new Map<string, GstHsnRow & { products: Set<string> }>();
    const byPlace = new Map<string, GstPlaceRow>();

    let taxableValue = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let invoiceValue = 0;

    for (const invoice of invoices) {
      taxableValue = round2(taxableValue + Number(invoice.subTotal));
      cgstAmount = round2(cgstAmount + Number(invoice.cgstAmount));
      sgstAmount = round2(sgstAmount + Number(invoice.sgstAmount));
      igstAmount = round2(igstAmount + Number(invoice.igstAmount));
      invoiceValue = round2(invoiceValue + Number(invoice.grandTotal));

      // Where it went. An invoice with no place recorded is treated as a local supply,
      // which is what the tax on it already assumed.
      const place = invoice.placeOfSupply ?? invoice.branch.stateCode ?? '—';
      const placeRow = byPlace.get(place) ?? {
        placeOfSupply: place,
        isInterState: Number(invoice.igstAmount) > 0,
        invoiceCount: 0,
        taxableValue: 0,
        totalTax: 0,
      };
      placeRow.invoiceCount += 1;
      placeRow.taxableValue = round2(placeRow.taxableValue + Number(invoice.subTotal));
      placeRow.totalTax = round2(placeRow.totalTax + Number(invoice.gstAmount));
      byPlace.set(place, placeRow);

      for (const line of invoice.lines) {
        const rate = Number(line.gstRate);
        const rateRow = byRate.get(rate) ?? {
          gstRate: rate,
          invoiceCount: 0,
          taxableValue: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          totalTax: 0,
          invoices: new Set<string>(),
        };
        rateRow.invoices.add(invoice.id);
        rateRow.taxableValue = round2(rateRow.taxableValue + Number(line.lineSubTotal));
        rateRow.cgstAmount = round2(rateRow.cgstAmount + Number(line.lineCgst));
        rateRow.sgstAmount = round2(rateRow.sgstAmount + Number(line.lineSgst));
        rateRow.igstAmount = round2(rateRow.igstAmount + Number(line.lineIgst));
        rateRow.totalTax = round2(rateRow.totalTax + Number(line.lineGst));
        byRate.set(rate, rateRow);

        const hsn = line.hsnCode?.trim() || 'Not set';
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
        hsnRow.taxableValue = round2(hsnRow.taxableValue + Number(line.lineSubTotal));
        hsnRow.totalTax = round2(hsnRow.totalTax + Number(line.lineGst));
        byHsn.set(hsn, hsnRow);
      }
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
      byRate: [...byRate.values()]
        .map(({ invoices: used, ...row }) => ({ ...row, invoiceCount: used.size }))
        .sort((a, b) => a.gstRate - b.gstRate),
      byHsn: [...byHsn.values()]
        .map(({ products, ...row }) => ({ ...row, productCount: products.size }))
        .sort((a, b) => b.taxableValue - a.taxableValue),
      byPlace: [...byPlace.values()].sort((a, b) => b.taxableValue - a.taxableValue),
    };
  }
}
