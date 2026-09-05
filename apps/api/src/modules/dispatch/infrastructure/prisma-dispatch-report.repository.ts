import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ageingBucketFor, AGEING_BUCKETS } from '@tiles-erp/shared';
import type {
  AgeingBucket,
  DriverCashReport,
  DriverCashRow,
  FreightCollectionReport,
  FreightCollectionRow,
  PendingDispatchAgeReport,
  PendingDispatchAgeRow,
  UUID,
  VehicleRunningReport,
  VehicleRunningRow,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { cashWithDriver, freightMargin, round2, round3, tripDistance } from '../application/dispatch.rules';
import type {
  DispatchReportRepository,
  DispatchReportWindow,
} from '../domain/dispatch-report.repository';

const DAY = 24 * 60 * 60 * 1000;

/**
 * The passes a report counts.
 *
 * Cancelled and draft passes are excluded everywhere: nothing left the yard on one, so
 * counting it would inflate every figure on every report.
 */
const reportable = (window: DispatchReportWindow): Prisma.GatePassWhereInput => ({
  deletedAt: null,
  status: { in: ['GATED_OUT', 'DELIVERED', 'CLOSED'] },
  passDate: { gte: window.from, lte: window.to },
  ...(window.branchId ? { branchId: window.branchId } : {}),
});

@Injectable()
export class PrismaDispatchReportRepository implements DispatchReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Freight per customer.
   *
   * Grouped by the customer on the **document**, not the pass header, because a round
   * carries several and the header names none of them.
   */
  async freightCollection(window: DispatchReportWindow): Promise<FreightCollectionReport> {
    const documents = await this.prisma.gatePassDocument.findMany({
      where: { gatePass: reportable(window) },
      select: {
        customerId: true,
        customerName: true,
        freightCharge: true,
        billedFreight: true,
        freightPaidAtBranch: true,
        freightCollected: true,
      },
    });

    const byCustomer = new Map<string, FreightCollectionRow>();
    for (const document of documents) {
      const key = document.customerId ?? 'none';
      const row = byCustomer.get(key) ?? {
        customerId: document.customerId,
        customerName: document.customerName ?? 'Transfers and samples',
        drops: 0,
        charged: 0,
        billedOnInvoice: 0,
        paidAtBranch: 0,
        collectedByDriver: 0,
        outstanding: 0,
      };
      row.drops += 1;
      row.charged = round2(row.charged + Number(document.freightCharge));
      row.billedOnInvoice = round2(row.billedOnInvoice + Number(document.billedFreight));
      row.paidAtBranch = round2(row.paidAtBranch + Number(document.freightPaidAtBranch));
      row.collectedByDriver = round2(row.collectedByDriver + Number(document.freightCollected));
      byCustomer.set(key, row);
    }

    // Outstanding is computed per drop, not from the customer's totals: one drop settled
    // twice over cannot pay for another that was never collected.
    for (const document of documents) {
      const key = document.customerId ?? 'none';
      const row = byCustomer.get(key)!;
      const due = Math.max(
        0,
        Number(document.freightCharge) -
          Number(document.billedFreight) -
          Number(document.freightPaidAtBranch) -
          Number(document.freightCollected),
      );
      row.outstanding = round2(row.outstanding + due);
    }

    const rows = [...byCustomer.values()].sort((a, b) => b.outstanding - a.outstanding || b.charged - a.charged);

    return {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      rows,
      totals: {
        drops: rows.reduce((sum, row) => sum + row.drops, 0),
        charged: round2(rows.reduce((sum, row) => sum + row.charged, 0)),
        billedOnInvoice: round2(rows.reduce((sum, row) => sum + row.billedOnInvoice, 0)),
        paidAtBranch: round2(rows.reduce((sum, row) => sum + row.paidAtBranch, 0)),
        collectedByDriver: round2(rows.reduce((sum, row) => sum + row.collectedByDriver, 0)),
        outstanding: round2(rows.reduce((sum, row) => sum + row.outstanding, 0)),
      },
    };
  }

  /**
   * What each vehicle did.
   *
   * Distance only counts trips with both odometer readings, and `measuredTrips` says how
   * many those were — a cost per kilometre computed over half the trips would flatter the
   * lorry, so the report shows what it is based on.
   */
  async vehicleRunning(window: DispatchReportWindow): Promise<VehicleRunningReport> {
    const passes = await this.prisma.gatePass.findMany({
      where: reportable(window),
      select: {
        vehicleId: true,
        vehicleNumber: true,
        transporterName: true,
        startKm: true,
        endKm: true,
        hireCharge: true,
        advancePaid: true,
        documents: { select: { freightCharge: true } },
        lines: { select: { qtyBoxes: true } },
      },
    });

    const byVehicle = new Map<string, VehicleRunningRow>();
    for (const pass of passes) {
      const key = pass.vehicleId ?? pass.vehicleNumber ?? 'unknown';
      const row = byVehicle.get(key) ?? {
        vehicleId: pass.vehicleId,
        vehicleNumber: pass.vehicleNumber ?? 'Not recorded',
        transporterName: pass.transporterName,
        trips: 0,
        measuredTrips: 0,
        km: 0,
        boxes: 0,
        hireCharge: 0,
        advancePaid: 0,
        chargedFreight: 0,
        margin: 0,
        costPerKm: null,
      };

      const km = tripDistance(pass.startKm, pass.endKm);
      row.trips += 1;
      if (km !== null) {
        row.measuredTrips += 1;
        row.km += km;
      }
      row.boxes = round3(
        row.boxes + pass.lines.reduce((sum, line) => sum + Number(line.qtyBoxes), 0),
      );
      row.hireCharge = round2(row.hireCharge + Number(pass.hireCharge));
      row.advancePaid = round2(row.advancePaid + Number(pass.advancePaid));
      row.chargedFreight = round2(
        row.chargedFreight +
          pass.documents.reduce((sum, document) => sum + Number(document.freightCharge), 0),
      );
      byVehicle.set(key, row);
    }

    const rows = [...byVehicle.values()].map((row) => ({
      ...row,
      margin: freightMargin(row.chargedFreight, row.hireCharge),
      costPerKm: row.km > 0 ? round2(row.hireCharge / row.km) : null,
    }));
    rows.sort((a, b) => b.trips - a.trips || a.vehicleNumber.localeCompare(b.vehicleNumber));

    const km = rows.reduce((sum, row) => sum + row.km, 0);
    const hireCharge = round2(rows.reduce((sum, row) => sum + row.hireCharge, 0));
    const chargedFreight = round2(rows.reduce((sum, row) => sum + row.chargedFreight, 0));

    return {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      rows,
      totals: {
        trips: rows.reduce((sum, row) => sum + row.trips, 0),
        measuredTrips: rows.reduce((sum, row) => sum + row.measuredTrips, 0),
        km,
        boxes: round3(rows.reduce((sum, row) => sum + row.boxes, 0)),
        hireCharge,
        advancePaid: round2(rows.reduce((sum, row) => sum + row.advancePaid, 0)),
        chargedFreight,
        margin: freightMargin(chargedFreight, hireCharge),
        costPerKm: km > 0 ? round2(hireCharge / km) : null,
      },
    };
  }

  /** What each driver was sent to collect, against what reached the desk. */
  async driverCash(window: DispatchReportWindow): Promise<DriverCashReport> {
    const passes = await this.prisma.gatePass.findMany({
      // Only a closed trip has been counted in, so an open one has nothing to reconcile.
      where: { ...reportable(window), status: 'CLOSED' },
      select: {
        driverId: true,
        driverName: true,
        cashHandedOver: true,
        documents: {
          select: {
            freightCharge: true,
            billedFreight: true,
            freightPaidAtBranch: true,
            freightCollected: true,
          },
        },
      },
    });

    const byDriver = new Map<string, DriverCashRow>();
    for (const pass of passes) {
      const key = pass.driverId ?? pass.driverName ?? 'unknown';
      const row = byDriver.get(key) ?? {
        driverId: pass.driverId,
        driverName: pass.driverName ?? 'Not recorded',
        trips: 0,
        toCollect: 0,
        collected: 0,
        cashHandedOver: 0,
        stillWithDriver: 0,
        tripsWithVariance: 0,
      };

      const toCollect = round2(
        pass.documents.reduce(
          (sum, document) =>
            sum +
            Math.max(
              0,
              Number(document.freightCharge) -
                Number(document.billedFreight) -
                Number(document.freightPaidAtBranch),
            ),
          0,
        ),
      );
      const collected = round2(
        pass.documents.reduce((sum, document) => sum + Number(document.freightCollected), 0),
      );
      const cash = Number(pass.cashHandedOver);

      row.trips += 1;
      row.toCollect = round2(row.toCollect + toCollect);
      row.collected = round2(row.collected + collected);
      row.cashHandedOver = round2(row.cashHandedOver + cash);
      // A trip counts as unsettled while any of what he took is still in his pocket.
      if (cashWithDriver(collected, cash) > 0) row.tripsWithVariance += 1;
      byDriver.set(key, row);
    }

    const rows = [...byDriver.values()].map((row) => ({
      ...row,
      stillWithDriver: cashWithDriver(row.collected, row.cashHandedOver),
    }));
    // The ones still carrying money first: that is what the report is opened to find.
    rows.sort((a, b) => b.stillWithDriver - a.stillWithDriver || b.trips - a.trips);

    const collected = round2(rows.reduce((sum, row) => sum + row.collected, 0));
    const cashHandedOver = round2(rows.reduce((sum, row) => sum + row.cashHandedOver, 0));

    return {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      rows,
      totals: {
        trips: rows.reduce((sum, row) => sum + row.trips, 0),
        toCollect: round2(rows.reduce((sum, row) => sum + row.toCollect, 0)),
        collected,
        cashHandedOver,
        stillWithDriver: cashWithDriver(collected, cashHandedOver),
        tripsWithVariance: rows.reduce((sum, row) => sum + row.tripsWithVariance, 0),
      },
    };
  }

  /**
   * The backlog: posted invoices with goods still in the godown.
   *
   * Not bounded by a period, because an invoice raised six weeks ago and never dispatched
   * is exactly what this report exists to surface — filtering it to "this month" would
   * hide the rows that matter most.
   */
  async pendingAgeing(branchId?: UUID): Promise<PendingDispatchAgeReport> {
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        deletedAt: null,
        status: 'POSTED',
        dispatchStatus: { in: ['PENDING', 'PARTIAL'] },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        customerName: true,
        dispatchStatus: true,
        grandTotal: true,
        branch: { select: { name: true } },
        lines: { select: { qtyBoxes: true, dispatchedQtyBoxes: true } },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    const now = Date.now();
    const rows: PendingDispatchAgeRow[] = [];

    for (const invoice of invoices) {
      const ordered = invoice.lines.reduce((sum, line) => sum + Number(line.qtyBoxes), 0);
      const pending = invoice.lines.reduce(
        (sum, line) => sum + Math.max(0, Number(line.qtyBoxes) - Number(line.dispatchedQtyBoxes)),
        0,
      );
      if (pending <= 0) continue;

      const waitingDays = Math.floor((now - invoice.invoiceDate.getTime()) / DAY);
      rows.push({
        salesInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate.toISOString(),
        customerName: invoice.customerName,
        branchName: invoice.branch.name,
        dispatchStatus: invoice.dispatchStatus,
        waitingDays,
        bucket: ageingBucketFor(waitingDays),
        pendingQtyBoxes: round3(pending),
        // Pro-rated by quantity: the invoice does not say what a single box was worth.
        pendingValue: ordered > 0 ? round2((Number(invoice.grandTotal) * pending) / ordered) : 0,
        partlyDispatched: invoice.dispatchStatus === 'PARTIAL',
      });
    }

    rows.sort((a, b) => b.waitingDays - a.waitingDays);

    const buckets = Object.fromEntries(
      AGEING_BUCKETS.map((bucket) => [bucket, { invoices: 0, boxes: 0, value: 0 }]),
    ) as Record<AgeingBucket, { invoices: number; boxes: number; value: number }>;

    for (const row of rows) {
      const bucket = buckets[row.bucket];
      bucket.invoices += 1;
      bucket.boxes = round3(bucket.boxes + row.pendingQtyBoxes);
      bucket.value = round2(bucket.value + row.pendingValue);
    }

    return { rows, buckets };
  }
}
