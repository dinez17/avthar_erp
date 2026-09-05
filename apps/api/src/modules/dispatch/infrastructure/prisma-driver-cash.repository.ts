import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  DriverCashHandoverItem,
  DriverDueSummary,
  DriverDueTrip,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { CashPostingService } from '../../accounts/infrastructure/cash-posting.service';
import { cashWithDriver, round2 } from '../application/dispatch.rules';
import type {
  DriverCashRepository,
  HandoverFilter,
  HandoverWriteData,
} from '../domain/driver-cash.repository';

const include = {
  branch: { select: { name: true } },
  account: { select: { name: true } },
  lines: { include: { gatePass: { select: { gatePassNo: true, passDate: true } } } },
} satisfies Prisma.DriverCashHandoverInclude;

type Row = Prisma.DriverCashHandoverGetPayload<{ include: typeof include }>;

const toItem = (row: Row, withLines: boolean): DriverCashHandoverItem => ({
  id: row.id,
  handoverNo: row.handoverNo,
  branchId: row.branchId,
  branchName: row.branch.name,
  driverId: row.driverId,
  driverName: row.driverName,
  handoverDate: row.handoverDate.toISOString(),
  amount: Number(row.amount),
  receivedByName: row.receivedByName,
  remarks: row.remarks,
  accountId: row.accountId,
  accountName: row.account?.name ?? null,
  tripCount: row.lines.length,
  version: row.version,
  ...(withLines
    ? {
        lines: row.lines.map((line) => ({
          id: line.id,
          gatePassId: line.gatePassId,
          gatePassNo: line.gatePass.gatePassNo,
          passDate: line.gatePass.passDate.toISOString(),
          amount: Number(line.amount),
        })),
      }
    : {}),
});

@Injectable()
export class PrismaDriverCashRepository implements DriverCashRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
    private readonly cash: CashPostingService,
  ) {}

  async nextHandoverNumber(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'DRIVER_CASH_HANDOVER', branchId ?? null);
  }

  async list(
    query: PaginationQuery,
    filter: HandoverFilter,
  ): Promise<Paginated<DriverCashHandoverItem>> {
    const where: Prisma.DriverCashHandoverWhereInput = {
      deletedAt: null,
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.driverId ? { driverId: filter.driverId } : {}),
      ...(filter.from || filter.to
        ? {
            handoverDate: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { handoverNo: { contains: query.search, mode: 'insensitive' } },
              { driverName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.driverCashHandover.findMany({
        where,
        include,
        orderBy: { handoverDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.driverCashHandover.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => toItem(row, false)),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: UUID): Promise<DriverCashHandoverItem | null> {
    const row = await this.prisma.driverCashHandover.findFirst({
      where: { id, deletedAt: null },
      include,
    });
    return row ? toItem(row, true) : null;
  }

  async create(
    number: string,
    data: HandoverWriteData,
    receivedBy: UUID,
    receivedByName: string,
  ): Promise<DriverCashHandoverItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      // Each trip's balance is re-read inside the transaction, so two counters taking the
      // same driver's money cannot both settle the same trip.
      for (const allocation of data.allocations) {
        const pass = await tx.gatePass.findFirst({
          where: { id: allocation.gatePassId, deletedAt: null },
          include: { documents: { select: { freightCollected: true } } },
        });
        if (!pass) throw new NotFoundError('One of the trips no longer exists');

        const collected = round2(
          pass.documents.reduce((sum, document) => sum + Number(document.freightCollected), 0),
        );
        const balance = cashWithDriver(collected, Number(pass.cashHandedOver));
        if (allocation.amount > balance + 0.005) {
          throw new ValidationError(
            `${pass.gatePassNo} only has ${balance} outstanding with the driver`,
          );
        }

        await tx.gatePass.update({
          where: { id: allocation.gatePassId },
          data: { cashHandedOver: { increment: allocation.amount } },
        });
      }

      const created = await tx.driverCashHandover.create({
        data: {
          handoverNo: number,
          branchId: data.branchId,
          driverId: data.driverId,
          driverName: data.driverName,
          handoverDate: data.handoverDate,
          amount: data.amount,
          receivedBy,
          receivedByName,
          remarks: data.remarks,
          accountId: data.accountId,
          createdBy: receivedBy,
          lines: {
            create: data.allocations.map((allocation) => ({
              gatePassId: allocation.gatePassId,
              amount: allocation.amount,
            })),
          },
        },
        include,
      });

      // The counter has already counted these notes once. Recording the drawer puts them
      // straight into its book rather than making someone type the same figure again on
      // the cash entry screen — which is where the two records start to disagree.
      if (data.accountId) {
        await this.cash.post(
          tx,
          {
            accountId: data.accountId,
            entryDate: data.handoverDate,
            type: 'RECEIPT',
            direction: 'IN',
            amount: data.amount,
            source: 'DRIVER_CASH',
            refType: 'DriverCashHandover',
            refId: created.id,
            refNumber: created.handoverNo,
            narration: `Cash from ${data.driverName} — ${created.handoverNo}`,
          },
          receivedBy,
        );
      }

      return created;
    });
    return toItem(row, true);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const handover = await tx.driverCashHandover.findFirst({
        where: { id, deletedAt: null },
        include: { lines: true },
      });
      if (!handover) throw new NotFoundError('Handover not found');

      // The money goes back to the driver's balance; the trips owe it again.
      for (const line of handover.lines) {
        await tx.gatePass.update({
          where: { id: line.gatePassId },
          data: { cashHandedOver: { decrement: Number(line.amount) } },
        });
      }

      // Whatever went into the drawer comes back out, as a contra row. The handover is
      // soft-deleted; the book is not, because the money was in the till for a while and
      // erasing that would leave the day's count unexplainable.
      await this.cash.reverseFor(
        tx,
        'DriverCashHandover',
        id,
        `${handover.handoverNo} deleted`,
        deletedBy,
      );

      await tx.driverCashHandover.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy },
      });
    });
  }

  async driverDue(
    driverId: UUID | null,
    driverName: string,
    branchId?: UUID,
  ): Promise<DriverDueSummary> {
    const passes = await this.prisma.gatePass.findMany({
      where: {
        deletedAt: null,
        status: 'CLOSED',
        ...(driverId ? { driverId } : { driverId: null, driverName }),
        ...(branchId ? { branchId } : {}),
      },
      include: {
        documents: {
          select: { freightCollected: true, customerName: true },
          orderBy: { sequence: 'asc' },
        },
      },
      // Oldest first: that is the order the money clears in.
      orderBy: { closedAt: 'asc' },
    });

    const trips: DriverDueTrip[] = [];
    for (const pass of passes) {
      const collected = round2(
        pass.documents.reduce((sum, document) => sum + Number(document.freightCollected), 0),
      );
      const handedOver = Number(pass.cashHandedOver);
      const balance = cashWithDriver(collected, handedOver);
      if (balance <= 0) continue;

      trips.push({
        gatePassId: pass.id,
        gatePassNo: pass.gatePassNo,
        passDate: pass.passDate.toISOString(),
        closedAt: pass.closedAt?.toISOString() ?? null,
        customerNames: [
          ...new Set(
            pass.documents
              .map((document) => document.customerName)
              .filter((name): name is string => name !== null),
          ),
        ],
        collected,
        handedOver,
        balance,
      });
    }

    return {
      driverId,
      driverName,
      balance: round2(trips.reduce((sum, trip) => sum + trip.balance, 0)),
      trips,
    };
  }

  async outstandingDrivers(branchId?: UUID): Promise<DriverDueSummary[]> {
    const passes = await this.prisma.gatePass.findMany({
      where: { deletedAt: null, status: 'CLOSED', ...(branchId ? { branchId } : {}) },
      select: {
        driverId: true,
        driverName: true,
        cashHandedOver: true,
        documents: { select: { freightCollected: true } },
      },
    });

    const byDriver = new Map<string, DriverDueSummary>();
    for (const pass of passes) {
      const collected = round2(
        pass.documents.reduce((sum, document) => sum + Number(document.freightCollected), 0),
      );
      const balance = cashWithDriver(collected, Number(pass.cashHandedOver));
      if (balance <= 0) continue;

      const key = pass.driverId ?? pass.driverName ?? 'unknown';
      const summary = byDriver.get(key) ?? {
        driverId: pass.driverId,
        driverName: pass.driverName ?? 'Not recorded',
        balance: 0,
        trips: [],
      };
      summary.balance = round2(summary.balance + balance);
      byDriver.set(key, summary);
    }

    return [...byDriver.values()].sort((a, b) => b.balance - a.balance);
  }
}
