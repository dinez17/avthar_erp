import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import { SixOrbitClient } from '@tiles-erp/sixorbit';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { inventoryQuantity, normalizeLocation, type InventoryRow } from '../domain/inventory-mapping';

export const inventoryToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
interface Location { key: string; warehouse: string; section: string; branchName: string; branchCode: string; branchId?: string; restoreBranch?: boolean; godownName: string; godownCode: string; godownId?: string; restoreGodown?: boolean; companyId: string; }
interface BalanceRef { id: string; branchId: string; godownId: string; gateId: string | null; batchNo: string | null; shade: string | null; qtyBoxes: Prisma.Decimal; }
interface Line { row: InventoryRow; productId: string; location: Location; target: Prisma.Decimal; current: Prisma.Decimal; currentTotal: Prisma.Decimal; balanceId?: string; outsideBalances: BalanceRef[]; }
interface Issue { itemId: string; product: string; warehouse: string; section: string; reason: string; }

@Injectable()
export class SixOrbitInventoryService {
  constructor(private readonly prisma: PrismaService, private readonly client: SixOrbitClient) {}

  private async plan(db: Prisma.TransactionClient, rows: InventoryRow[]) {
    const [products, branches, balances] = await Promise.all([
      db.product.findMany({ where: { deletedAt: null, sixorbitId: { not: null } }, select: { id: true, sixorbitId: true, baseUom: true, piecesPerBox: true, sqftPerBox: true } }),
      // Include inactive and soft-deleted locations. Their unique codes remain reserved in
      // PostgreSQL, so treating them as absent makes apply attempt an invalid duplicate
      // insert. Exact SixOrbit matches are restored during apply instead.
      db.branch.findMany({ include: { godowns: true } }),
      db.stockBalance.findMany(),
    ]);
    const dgl = branches.find(b => b.code === 'DGL');
    if (!dgl?.isActive) throw new ValidationError('The active DGL branch is required for the SixOrbit location mapping.');
    const mainGodown = dgl.godowns.find(g => g.code === 'MAIN' && g.isActive && !g.deletedAt);
    if (!mainGodown) throw new ValidationError('The active DGL Main Godown is required for the SixOrbit stock sync.');
    const byProduct = new Map(products.map(p => [p.sixorbitId, p]));
    const balanceGroups = new Map<string, typeof balances>();
    for (const b of balances) { const key = `${b.productId}|${b.godownId}`; const group = balanceGroups.get(key) ?? []; group.push(b); balanceGroups.set(key, group); }
    const balanceTotals = new Map<string, Prisma.Decimal>();
    for (const b of balances) balanceTotals.set(b.productId, (balanceTotals.get(b.productId) ?? new Prisma.Decimal(0)).add(b.qtyBoxes));
    const itemCounts = new Map<string, number>();
    for (const r of rows) {
      itemCounts.set(r.item_id, (itemCounts.get(r.item_id) ?? 0) + 1);
    }
    const locations = new Map<string, Location>();
    const lines: Line[] = [];
    const issues: Issue[] = [];
    const units = new Map<string, { stock: Prisma.Decimal; allocated: Prisma.Decimal }>();
    for (const row of rows) {
      try {
        if ((itemCounts.get(row.item_id) ?? 0) > 1) throw new Error('Multiple inventory rows for one product require review');
        // inventory_report returns a company-wide total but attaches an unreliable
        // warehouse/section label. The business has chosen DGL Main Godown as the single
        // receiving location for these totals, so the source location is deliberately
        // ignored rather than mapped.
        const key = 'DGL|MAIN';
        const location: Location = {
          key, warehouse: 'DINDIGUL MAIN', section: 'MAIN GODOWN', branchCode: dgl.code,
          branchName: dgl.name,
          branchId: dgl.id,
          godownName: mainGodown.name, godownCode: mainGodown.code, godownId: mainGodown.id,
          companyId: dgl.companyId,
        };
        locations.set(key, location);
        const product = byProduct.get(row.item_id);
        if (!product) throw new Error('Product not linked in ERP; import the product first');
        const target = inventoryQuantity(row, product);
        if (!/^-?\d+(\.\d+)?$/.test(String(row.allocated_stock))) throw new Error('Invalid allocated quantity');
        const allocated = new Prisma.Decimal(row.allocated_stock);
        if (allocated.isNegative()) throw new Error('Negative allocation requires review');
        const stock = balanceGroups.get(`${product.id}|${mainGodown.id}`) ?? [];
        if (stock.some(b => b.gateId || b.batchNo || b.shade)) throw new Error('ERP stock has gate/batch/shade detail; manual reconciliation required');
        if (stock.length > 1) throw new Error('Duplicate ERP balances require review');
        const current = stock[0]?.qtyBoxes ?? new Prisma.Decimal(0);
        const currentTotal = balanceTotals.get(product.id) ?? new Prisma.Decimal(0);
        const outsideBalances = balances.filter(b => b.productId === product.id && b.godownId !== mainGodown.id);
        locations.set(key, location);
        lines.push({ row, productId: product.id, location, target, current, currentTotal, balanceId: stock[0]?.id, outsideBalances });
        const unit = normalizeLocation(row.unit);
        const total = units.get(unit) ?? { stock: new Prisma.Decimal(0), allocated: new Prisma.Decimal(0) };
        total.stock = total.stock.add(row.stock); total.allocated = total.allocated.add(allocated); units.set(unit, total);
      } catch (e) {
        issues.push({ itemId: row.item_id, product: row.item_name, warehouse: row.warehouse, section: row.section ?? '', reason: e instanceof Error ? e.message : String(e) });
      }
    }
    const summary = {
      fetched: rows.length, matched: lines.length, skipped: issues.length,
      adjustments: lines.filter(l => !l.target.equals(l.current) || l.outsideBalances.some(b => !b.qtyBoxes.isZero())).length,
      unchanged: lines.filter(l => l.target.equals(l.current) && l.outsideBalances.every(b => b.qtyBoxes.isZero())).length,
      branchesToCreate: new Set([...locations.values()].filter(l => !l.branchId).map(l => l.branchCode)).size,
      branchesToRestore: new Set([...locations.values()].filter(l => l.restoreBranch).map(l => l.branchId)).size,
      godownsToCreate: [...locations.values()].filter(l => !l.godownId).length,
      godownsToRestore: [...locations.values()].filter(l => l.restoreGodown).length,
      locations: [...locations.values()].map(l => ({ warehouse: l.warehouse, section: l.section, branch: l.branchName, godown: l.godownName, createBranch: !l.branchId, restoreBranch: Boolean(l.restoreBranch), createGodown: !l.godownId, restoreGodown: Boolean(l.restoreGodown) })),
      totalsBySourceUnit: [...units].map(([unit, t]) => ({ unit, stock: t.stock.toString(), allocated: t.allocated.toString() })),
      issues,
    };
    return { summary, locations, lines };
  }

  async preview(startDate: string, endDate: string, actorId: string) {
    if (startDate > endDate || endDate !== inventoryToday()) throw new ValidationError('Use today as the report end date when syncing current stock.');
    const fetchedAt = new Date();
    const data = await this.client.callOrThrow<{ inventory_report?: InventoryRow[] }>({
      spec: { task: 'report/inventory_report', version: '4.0', method: 'GET', authenticated: true },
      params: { traversal: 1, limit: 50000, start_date: startDate, end_date: endDate },
      log: { entityType: 'PRODUCT', direction: 'PULL' },
    });
    const rows = data.inventory_report;
    if (!Array.isArray(rows) || !rows.length) throw new ValidationError('SixOrbit returned no inventory rows. Existing stock was not changed.');
    if (rows.length >= 50000) throw new ValidationError('Inventory reached the 50,000-row limit. Confirm pagination before syncing.');
    if (rows.some(r => !r || typeof r.item_id !== 'string' || typeof r.warehouse !== 'string' || typeof r.unit !== 'string' || (r.section != null && typeof r.section !== 'string'))) throw new ValidationError('Inventory response contains malformed identifiers or locations.');
    const { summary } = await this.plan(this.prisma, rows);
    const run = await this.prisma.sixOrbitInventoryRun.create({ data: { startDate, endDate, report: json(rows), summary: json(summary), createdBy: actorId, createdAt: fetchedAt } });
    return { id: run.id, status: run.status, startDate, endDate, ...summary };
  }

  async get(id: string) {
    const run = await this.prisma.sixOrbitInventoryRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundError('Inventory sync not found');
    return { id: run.id, status: run.status, startDate: run.startDate, endDate: run.endDate, ...(run.summary as object) };
  }

  async apply(id: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      // Serialize imports, then exclude concurrent stock writers while computing deltas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9172026)`;
      const run = await tx.sixOrbitInventoryRun.findUnique({ where: { id } });
      if (!run) throw new NotFoundError('Inventory sync not found');
      if (run.status === 'APPLIED') return { id, status: run.status, ...(run.summary as object) };
      if (run.endDate !== inventoryToday() || Date.now() - run.createdAt.getTime() > 30 * 60 * 1000) throw new ConflictError('Preview expired. Fetch a fresh inventory preview.');
      await tx.$executeRawUnsafe('LOCK TABLE stock_movements, stock_balances IN SHARE ROW EXCLUSIVE MODE');
      const plan = await this.plan(tx, run.report as unknown as InventoryRow[]);
      const touchedProductIds = [...new Set(plan.lines.map(l => l.productId))];
      if (touchedProductIds.length && await tx.stockMovement.findFirst({ where: { createdAt: { gt: run.createdAt }, productId: { in: touchedProductIds } }, select: { id: true } })) throw new ConflictError('ERP stock changed after the report was fetched. Fetch a fresh preview.');
      const newBranches = new Map<string, string>();
      for (const l of plan.locations.values()) {
        if (!l.branchId) {
          l.branchId = newBranches.get(l.branchCode);
          if (!l.branchId) {
            const b = await tx.branch.upsert({
              where: { code: l.branchCode },
              create: { companyId: l.companyId, name: l.branchName, code: l.branchCode, createdBy: actorId },
              update: { deletedAt: null, deletedBy: null, isActive: true, updatedBy: actorId },
            });
            l.branchId = b.id; newBranches.set(l.branchCode, b.id);
            await tx.userBranch.upsert({ where: { userId_branchId: { userId: actorId, branchId: b.id } }, create: { userId: actorId, branchId: b.id }, update: {} });
          }
        }
        if (l.restoreBranch) {
          await tx.branch.update({ where: { id: l.branchId }, data: { deletedAt: null, deletedBy: null, isActive: true, updatedBy: actorId } });
          await tx.userBranch.upsert({ where: { userId_branchId: { userId: actorId, branchId: l.branchId! } }, create: { userId: actorId, branchId: l.branchId! }, update: {} });
        }
        if (!l.godownId) {
          l.godownId = (await tx.godown.upsert({
            where: { branchId_code: { branchId: l.branchId!, code: l.godownCode } },
            create: { branchId: l.branchId!, name: l.godownName, code: l.godownCode, createdBy: actorId },
            update: { deletedAt: null, deletedBy: null, isActive: true, updatedBy: actorId },
          })).id;
        } else if (l.restoreGodown) {
          await tx.godown.update({ where: { id: l.godownId }, data: { deletedAt: null, deletedBy: null, isActive: true, updatedBy: actorId } });
        }
      }
      const postings: Prisma.StockMovementCreateManyInput[] = [];
      const creates: Prisma.StockBalanceCreateManyInput[] = [];
      const now = new Date();
      for (const line of plan.lines) {
        const l = plan.locations.get(line.location.key)!;
        for (const balance of line.outsideBalances) {
          if (!balance.qtyBoxes.isZero()) postings.push({ id: randomUUID(), productId: line.productId, branchId: balance.branchId, godownId: balance.godownId, gateId: balance.gateId, batchNo: balance.batchNo, shade: balance.shade, type: 'ADJUSTMENT', direction: balance.qtyBoxes.isPositive() ? 'OUT' : 'IN', qtyBoxes: balance.qtyBoxes.abs(), refType: 'SIXORBIT_INVENTORY', refId: id, reason: 'Consolidate SixOrbit company stock in DGL Main Godown', remarks: `Source ${line.row.stock} ${line.row.unit}`, movementDate: now, createdBy: actorId });
        }
        if (line.outsideBalances.length) await tx.stockBalance.deleteMany({ where: { id: { in: line.outsideBalances.map(b => b.id) } } });
        const delta = line.target.sub(line.current);
        if (!delta.isZero()) postings.push({ id: randomUUID(), productId: line.productId, branchId: l.branchId!, godownId: l.godownId!, type: 'ADJUSTMENT', direction: delta.isPositive() ? 'IN' : 'OUT', qtyBoxes: delta.abs(), refType: 'SIXORBIT_INVENTORY', refId: id, reason: 'Reconcile SixOrbit company stock in DGL Main Godown', remarks: `Source ${line.row.stock} ${line.row.unit}; allocated ${line.row.allocated_stock} stored separately in sync snapshot`, movementDate: now, createdBy: actorId });
        if (line.balanceId) await tx.stockBalance.update({ where: { id: line.balanceId }, data: { qtyBoxes: line.target } });
        else if (!line.target.isZero()) creates.push({ id: randomUUID(), productId: line.productId, branchId: l.branchId!, godownId: l.godownId!, qtyBoxes: line.target });
      }
      for (let i = 0; i < postings.length; i += 500) await tx.stockMovement.createMany({ data: postings.slice(i, i + 500) });
      for (let i = 0; i < creates.length; i += 500) await tx.stockBalance.createMany({ data: creates.slice(i, i + 500) });
      await tx.sixOrbitInventoryRun.update({ where: { id }, data: { status: 'APPLIED', appliedAt: now, summary: json(plan.summary) } });
      return { id, status: 'APPLIED', ...plan.summary };
    }, { timeout: 120000, maxWait: 10000 });
  }
}
