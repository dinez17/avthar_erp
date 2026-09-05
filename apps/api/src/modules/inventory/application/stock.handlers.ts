import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { ConflictError, ValidationError } from '@tiles-erp/shared';
import type {
  BulkSetStockInput,
  BulkSetStockResult,
  BulkSetStockResultLine,
  Paginated,
  PaginationQuery,
  PostAdjustmentInput,
  PostOpeningStockInput,
  StockBalanceItem,
  StockEntryLine,
  StockMovementItem,
  UUID,
} from '@tiles-erp/shared-types';
import {
  STOCK_REPOSITORY,
  type MovementFilter,
  type MovementPosting,
  type StockBalanceFilter,
  type StockRepository,
} from '../domain/stock.repository';

const MAX_LINES = 500;

export class ListStockBalancesQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: StockBalanceFilter,
  ) {}
}

export class ListCountSheetQuery {
  constructor(
    public readonly branchId: UUID,
    public readonly godownId: UUID,
    public readonly pagination: PaginationQuery,
    public readonly filter: StockBalanceFilter,
  ) {}
}

export class ListStockMovementsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: MovementFilter,
  ) {}
}

export class PostOpeningStockCommand {
  constructor(
    public readonly data: PostOpeningStockInput,
    public readonly actorId: UUID,
  ) {}
}

export class BulkSetStockCommand {
  constructor(
    public readonly data: BulkSetStockInput,
    public readonly actorId: UUID,
  ) {}
}

export class PostAdjustmentCommand {
  constructor(
    public readonly data: PostAdjustmentInput,
    public readonly actorId: UUID,
  ) {}
}

/** Rejects malformed line sets before anything is written. */
function assertLines(lines: StockEntryLine[], allowNegative: boolean): void {
  if (lines.length === 0) throw new ValidationError('At least one line is required');
  if (lines.length > MAX_LINES) {
    throw new ValidationError(`At most ${MAX_LINES} lines per posting`);
  }
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.qtyBoxes === 0) {
      throw new ValidationError('Quantity cannot be zero');
    }
    if (!allowNegative && line.qtyBoxes < 0) {
      throw new ValidationError('Opening stock quantities must be positive');
    }
    const key = [
      line.productId,
      line.godownId,
      line.gateId ?? '',
      line.batchNo ?? '',
      line.shade ?? '',
    ].join('|');
    if (seen.has(key)) {
      throw new ValidationError(
        'The same product/godown/batch/shade appears more than once; combine those lines',
      );
    }
    seen.add(key);
  }
}

@QueryHandler(ListStockBalancesQuery)
export class ListStockBalancesHandler
  implements IQueryHandler<ListStockBalancesQuery, Paginated<StockBalanceItem>>
{
  constructor(@Inject(STOCK_REPOSITORY) private readonly stock: StockRepository) {}

  execute(query: ListStockBalancesQuery): Promise<Paginated<StockBalanceItem>> {
    return this.stock.listBalances(query.pagination, query.filter);
  }
}

@QueryHandler(ListCountSheetQuery)
export class ListCountSheetHandler
  implements IQueryHandler<ListCountSheetQuery, Paginated<StockBalanceItem>>
{
  constructor(@Inject(STOCK_REPOSITORY) private readonly stock: StockRepository) {}

  execute(query: ListCountSheetQuery): Promise<Paginated<StockBalanceItem>> {
    return this.stock.listCountSheet(query.branchId, query.godownId, query.pagination, query.filter);
  }
}

@QueryHandler(ListStockMovementsQuery)
export class ListStockMovementsHandler
  implements IQueryHandler<ListStockMovementsQuery, Paginated<StockMovementItem>>
{
  constructor(@Inject(STOCK_REPOSITORY) private readonly stock: StockRepository) {}

  execute(query: ListStockMovementsQuery): Promise<Paginated<StockMovementItem>> {
    return this.stock.listMovements(query.pagination, query.filter);
  }
}

@CommandHandler(PostOpeningStockCommand)
export class PostOpeningStockHandler
  implements ICommandHandler<PostOpeningStockCommand, number>
{
  constructor(@Inject(STOCK_REPOSITORY) private readonly stock: StockRepository) {}

  async execute(command: PostOpeningStockCommand): Promise<number> {
    const { branchId, lines, remarks } = command.data;
    assertLines(lines, false);

    // Opening stock may only be declared once per product/godown; later corrections
    // go through adjustments so the audit trail stays intact.
    for (const line of lines) {
      if (await this.stock.hasOpeningStock(branchId, line.productId, line.godownId)) {
        throw new ConflictError(
          'Opening stock already exists for one or more products in this godown. Use an adjustment instead.',
        );
      }
    }

    const movementDate = command.data.movementDate
      ? new Date(command.data.movementDate)
      : new Date();

    const postings: MovementPosting[] = lines.map((line) => ({
      productId: line.productId,
      branchId,
      godownId: line.godownId,
      gateId: line.gateId ?? null,
      batchNo: line.batchNo ?? null,
      shade: line.shade ?? null,
      type: 'OPENING',
      direction: 'IN',
      qtyBoxes: line.qtyBoxes,
      refType: 'OPENING',
      remarks: remarks ?? null,
      movementDate,
      createdBy: command.actorId,
    }));

    return this.stock.postMovements(postings);
  }
}

@CommandHandler(PostAdjustmentCommand)
export class PostAdjustmentHandler implements ICommandHandler<PostAdjustmentCommand, number> {
  constructor(@Inject(STOCK_REPOSITORY) private readonly stock: StockRepository) {}

  async execute(command: PostAdjustmentCommand): Promise<number> {
    const { branchId, lines, reason, remarks } = command.data;
    if (!reason?.trim()) throw new ValidationError('An adjustment reason is required');
    assertLines(lines, true);

    // Guard against driving any stock key negative.
    for (const line of lines) {
      if (line.qtyBoxes >= 0) continue;
      const available = await this.stock.currentQty({
        productId: line.productId,
        branchId,
        godownId: line.godownId,
        gateId: line.gateId ?? null,
        batchNo: line.batchNo ?? null,
        shade: line.shade ?? null,
      });
      if (available + line.qtyBoxes < 0) {
        throw new ValidationError(
          `Adjustment would take stock negative (available ${available} boxes, reducing by ${Math.abs(line.qtyBoxes)})`,
        );
      }
    }

    const movementDate = command.data.movementDate
      ? new Date(command.data.movementDate)
      : new Date();

    const postings: MovementPosting[] = lines.map((line) => ({
      productId: line.productId,
      branchId,
      godownId: line.godownId,
      gateId: line.gateId ?? null,
      batchNo: line.batchNo ?? null,
      shade: line.shade ?? null,
      type: 'ADJUSTMENT',
      direction: line.qtyBoxes >= 0 ? 'IN' : 'OUT',
      qtyBoxes: Math.abs(line.qtyBoxes),
      refType: 'ADJUSTMENT',
      reason: reason.trim(),
      remarks: remarks ?? null,
      movementDate,
      createdBy: command.actorId,
    }));

    return this.stock.postMovements(postings);
  }
}


const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Sets counted stock levels in bulk. The caller supplies what was physically
 * counted; the engine posts an ADJUSTMENT movement for the difference against the
 * current balance, so history remains a faithful record of every change.
 */
@CommandHandler(BulkSetStockCommand)
export class BulkSetStockHandler
  implements ICommandHandler<BulkSetStockCommand, BulkSetStockResult>
{
  constructor(@Inject(STOCK_REPOSITORY) private readonly stock: StockRepository) {}

  async execute(command: BulkSetStockCommand): Promise<BulkSetStockResult> {
    const { branchId, godownId, gateId, reason, remarks, lines } = command.data;
    if (!reason?.trim()) throw new ValidationError('A reason is required');
    if (lines.length === 0) throw new ValidationError('At least one line is required');
    if (lines.length > MAX_LINES) {
      throw new ValidationError(`At most ${MAX_LINES} lines per posting`);
    }

    const seen = new Set<string>();
    for (const line of lines) {
      if (line.boxes < 0 || line.pieces < 0) {
        throw new ValidationError('Counted quantities cannot be negative');
      }
      const key = `${line.productId}|${line.batchNo ?? ''}|${line.shade ?? ''}`;
      if (seen.has(key)) {
        throw new ValidationError(
          'The same product/batch/shade appears more than once; combine those lines',
        );
      }
      seen.add(key);
    }

    const conversions = await this.stock.productConversions(lines.map((l) => l.productId));
    const missing = lines.find((l) => !conversions.has(l.productId));
    if (missing) throw new ValidationError('One or more products no longer exist');

    const current = await this.stock.currentQtyMany(
      branchId,
      godownId,
      gateId ?? null,
      lines.map((l) => ({ productId: l.productId, batchNo: l.batchNo, shade: l.shade })),
    );

    const movementDate = command.data.movementDate
      ? new Date(command.data.movementDate)
      : new Date();

    const postings: MovementPosting[] = [];
    const resultLines: BulkSetStockResultLine[] = [];
    let unchanged = 0;

    for (const line of lines) {
      const conversion = conversions.get(line.productId);
      if (!conversion) continue;
      if (line.pieces > 0 && conversion.piecesPerBox <= 0) {
        throw new ValidationError(`Product ${conversion.sku} has no pieces-per-box configured`);
      }

      const target = round3(line.boxes + (line.pieces > 0 ? line.pieces / conversion.piecesPerBox : 0));
      const key = `${line.productId}|${line.batchNo ?? ''}|${line.shade ?? ''}`;
      const previous = current.get(key) ?? 0;
      const delta = round3(target - previous);

      resultLines.push({
        productId: line.productId,
        sku: conversion.sku,
        previousBoxes: previous,
        newBoxes: target,
        deltaBoxes: delta,
      });

      if (delta === 0) {
        unchanged += 1;
        continue;
      }

      postings.push({
        productId: line.productId,
        branchId,
        godownId,
        gateId: gateId ?? null,
        batchNo: line.batchNo ?? null,
        shade: line.shade ?? null,
        type: 'ADJUSTMENT',
        direction: delta > 0 ? 'IN' : 'OUT',
        qtyBoxes: Math.abs(delta),
        refType: 'STOCK_COUNT',
        reason: reason.trim(),
        remarks: remarks ?? null,
        movementDate,
        createdBy: command.actorId,
      });
    }

    const posted = await this.stock.postMovements(postings);
    return { posted, unchanged, lines: resultLines };
  }
}
