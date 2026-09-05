import { Injectable } from '@nestjs/common';
import type {
  Gstr1B2bRow,
  Gstr1B2clRow,
  Gstr1B2csRow,
  Gstr1DocRow,
  Gstr1HsnRow,
  Gstr1Return,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { GstWindow } from '../domain/gst.repository';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** The offline tool wants dd-mm-yyyy, not an ISO date. */
const gstDate = (date: Date): string =>
  `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;

/** Above this, an unregistered inter-state sale is B2CL rather than B2CS. */
const B2CL_THRESHOLD = 250000;

/** Unit quantity code. Tiles are sold by the box, which GST records as BOX. */
const UQC: Record<string, string> = { BOX: 'BOX-BOXES', PIECE: 'PCS-PIECES', SQFT: 'SQF-SQUARE FEET' };

@Injectable()
export class PrismaGstr1Repository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds the GSTR-1 sections for a period.
   *
   * The classification is the return's own, not ours: an invoice is **B2B** when the
   * customer has a GSTIN, **B2CL** when they do not and it is a large inter-state sale,
   * and **B2CS** otherwise — where only the rate-wise totals per state are reported, not
   * the individual invoices.
   */
  async returnData(window: GstWindow): Promise<Gstr1Return> {
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        deletedAt: null,
        status: { in: ['POSTED', 'CANCELLED'] },
        invoiceDate: { gte: window.from, lte: window.to },
        ...(window.branchId ? { branchId: window.branchId } : {}),
      },
      select: {
        invoiceNumber: true,
        invoiceDate: true,
        status: true,
        customerName: true,
        customerGstin: true,
        placeOfSupply: true,
        grandTotal: true,
        igstAmount: true,
        branch: { select: { stateCode: true } },
        lines: {
          select: {
            hsnCode: true,
            qtyBoxes: true,
            gstRate: true,
            lineSubTotal: true,
            lineCgst: true,
            lineSgst: true,
            lineIgst: true,
            lineGst: true,
            lineTotal: true,
            product: { select: { name: true, baseUom: true } },
          },
        },
      },
      orderBy: { invoiceNumber: 'asc' },
    });

    const posted = invoices.filter((invoice) => invoice.status === 'POSTED');

    const b2b: Gstr1B2bRow[] = [];
    const b2cl: Gstr1B2clRow[] = [];
    const b2csByKey = new Map<string, Gstr1B2csRow>();
    const hsnB2b = new Map<string, Gstr1HsnRow>();
    const hsnB2c = new Map<string, Gstr1HsnRow>();

    for (const invoice of posted) {
      const place = invoice.placeOfSupply ?? invoice.branch.stateCode ?? '';
      const interState = Number(invoice.igstAmount) > 0;
      const isB2b = Boolean(invoice.customerGstin?.trim());
      const invoiceValue = round2(Number(invoice.grandTotal));

      // One row per rate within the invoice: the return reports rate-wise, not line-wise.
      const byRate = new Map<number, { taxable: number }>();
      for (const line of invoice.lines) {
        const rate = Number(line.gstRate);
        const entry = byRate.get(rate) ?? { taxable: 0 };
        entry.taxable = round2(entry.taxable + Number(line.lineSubTotal));
        byRate.set(rate, entry);
      }

      for (const [rate, entry] of byRate) {
        if (isB2b) {
          b2b.push({
            gstin: invoice.customerGstin!.trim(),
            receiverName: invoice.customerName,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: gstDate(invoice.invoiceDate),
            invoiceValue,
            placeOfSupply: place,
            reverseCharge: 'N',
            invoiceType: 'Regular B2B',
            rate,
            taxableValue: entry.taxable,
            cessAmount: 0,
          });
        } else if (interState && invoiceValue > B2CL_THRESHOLD) {
          b2cl.push({
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: gstDate(invoice.invoiceDate),
            invoiceValue,
            placeOfSupply: place,
            rate,
            taxableValue: entry.taxable,
            cessAmount: 0,
          });
        } else {
          // B2C small is reported as a total per state and rate, never invoice by invoice.
          const key = `${place}|${rate}`;
          const row = b2csByKey.get(key) ?? {
            type: 'OE' as const,
            placeOfSupply: place,
            rate,
            taxableValue: 0,
            cessAmount: 0,
          };
          row.taxableValue = round2(row.taxableValue + entry.taxable);
          b2csByKey.set(key, row);
        }
      }

      // HSN is reported separately for B2B and B2C supplies.
      const target = isB2b ? hsnB2b : hsnB2c;
      for (const line of invoice.lines) {
        const hsn = line.hsnCode?.trim() || '';
        const rate = Number(line.gstRate);
        const key = `${hsn}|${rate}`;
        const row = target.get(key) ?? {
          hsn,
          description: line.product.name,
          uqc: UQC[line.product.baseUom] ?? 'OTH-OTHERS',
          totalQuantity: 0,
          totalValue: 0,
          rate,
          taxableValue: 0,
          integratedTax: 0,
          centralTax: 0,
          stateTax: 0,
          cessAmount: 0,
        };
        row.totalQuantity = round3(row.totalQuantity + Number(line.qtyBoxes));
        row.totalValue = round2(row.totalValue + Number(line.lineTotal));
        row.taxableValue = round2(row.taxableValue + Number(line.lineSubTotal));
        row.integratedTax = round2(row.integratedTax + Number(line.lineIgst));
        row.centralTax = round2(row.centralTax + Number(line.lineCgst));
        row.stateTax = round2(row.stateTax + Number(line.lineSgst));
        target.set(key, row);
      }
    }

    return {
      fromDate: window.from.toISOString(),
      toDate: window.to.toISOString(),
      b2b,
      b2cl,
      b2cs: [...b2csByKey.values()].sort(
        (a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.rate - b.rate,
      ),
      hsnB2b: [...hsnB2b.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate),
      hsnB2c: [...hsnB2c.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate),
      docs: this.documentSeries(invoices),
    };
  }

  /**
   * Table 13: the document series issued in the period. The offline tool wants the first
   * and last number of each run and how many were cancelled — which is why cancelled
   * invoices are fetched alongside the posted ones.
   */
  private documentSeries(
    invoices: { invoiceNumber: string; status: string }[],
  ): Gstr1DocRow[] {
    if (invoices.length === 0) return [];
    const numbers = invoices.map((invoice) => invoice.invoiceNumber).sort();

    return [
      {
        natureOfDocument: 'Invoices for outward supply',
        serialFrom: numbers[0]!,
        serialTo: numbers[numbers.length - 1]!,
        totalNumber: invoices.length,
        cancelled: invoices.filter((invoice) => invoice.status === 'CANCELLED').length,
      },
    ];
  }
}
