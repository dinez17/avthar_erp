import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { inventoryQuantity, normalizeLocation } from '../domain/inventory-mapping';
import { inventoryToday } from './sixorbit-inventory.service';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const WAREHOUSES = [
  { header: 'DINDIGUL MAIN', name: 'AVTHAR CERAMICS - DGL', code: 'DGL', aliases: ['DGL', 'DINDIGUL'] },
  { header: 'MADURAI BRANCH GODOWN', name: 'MADURAI BRANCH GODOWN', code: 'MDU', aliases: ['MADURAI'], excludes: ['KARAPPAYURANI', 'KARAP'] },
  { header: 'PALLADAM BRANCH GODOWN', name: 'PALLADAM BRANCH GODOWN', code: 'PDM', aliases: ['PALLADAM', 'A,M,BUILD MART', 'A, M, BUILD MART', 'AM BUILD MART'] },
  { header: 'TRICHY BRANCH GODOWN', name: 'TRICHY BRANCH GODOWN', code: 'TRY', aliases: ['TRICHY', 'TIRUCHIRAPPALLI'] },
  { header: 'THENI BRANCH GODOWN', name: 'THENI BRANCH GODOWN', code: 'TNI', aliases: ['THENI'] },
  { header: 'DHARAPURAM BRANCH GODOWN', name: 'DHARAPURAM BRANCH GODOWN', code: 'DPM', aliases: ['DHARAPURAM'] },
  { header: 'MADURAI KARAPPAYURANI GODOWN', name: 'MADURAI KARAPPAYURANI GODOWN', code: 'MKP', aliases: ['KARAPPAYURANI', 'KARAP'] },
  { header: 'ASSART GODOWN', name: 'ASSART GODOWN', code: 'AST', aliases: ['ASSART'] },
] as const;

interface ExcelLocation { key: string; warehouse: string; godown: string; column: number; totalColumn: number; }
interface ExcelStockRow { itemId: string; name: string; unit: string; quantities: Record<string, string>; totals: Record<string, string>; }
interface ExcelReport { source: 'SIXORBIT_VARIATIONS_EXCEL'; formatVersion: 3; fileName: string; locations: ExcelLocation[]; rows: ExcelStockRow[]; }
interface Issue { itemId: string; product: string; warehouse: string; reason: string; }
interface PlannedLine { productId: string; itemId: string; product: string; warehouse: string; unit: string; sourceQty: string; target: Prisma.Decimal; current: Prisma.Decimal; branchId: string; branch: string; godownId: string; godown: string; }

@Injectable()
export class SixOrbitInventoryExcelService {
  constructor(private readonly prisma: PrismaService) {}

  private cell(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'object' && 'result' in value) return this.cell((value as { result?: unknown }).result);
    if (typeof value === 'object' && 'text' in value) return String((value as { text?: unknown }).text ?? '').trim();
    return String(value).trim();
  }

  private masterCode(value: string): string {
    const normalized = normalizeLocation(value).replace(/\s+GODOWN$/, '');
    return normalized.replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'MAIN';
  }

  private godownMasterName(warehouse: string, godown: string): string {
    const value = normalizeLocation(godown);
    if (warehouse === 'ASSART GODOWN' && value === '1') return 'ASSART GODOWN';
    if (['PALLADAM BRANCH GODOWN', 'TRICHY BRANCH GODOWN', 'THENI BRANCH GODOWN', 'DHARAPURAM BRANCH GODOWN'].includes(warehouse) && /^\d+$/.test(value)) {
      return `GODOWN ${value}`;
    }
    return value;
  }

  private matchGodowns<T extends { name: string; code: string }>(godowns: T[], excelName: string, masterName: string): T[] {
    const wanted = normalizeLocation(excelName);
    const canonical = normalizeLocation(masterName);
    const exactCanonical = godowns.filter(godown => normalizeLocation(godown.name) === canonical);
    if (exactCanonical.length) return exactCanonical;
    const exactCode = godowns.filter(godown => normalizeLocation(godown.code) === wanted);
    if (exactCode.length) return exactCode;
    const wantedShort = wanted.replace(/\s+GODOWN$/, '').replace(/^GODOWN\s+/, '');
    return godowns.filter(godown => {
      const nameShort = normalizeLocation(godown.name).replace(/\s+GODOWN$/, '').replace(/^GODOWN\s+/, '');
      const codeShort = normalizeLocation(godown.code).replace(/\s+GODOWN$/, '').replace(/^GODOWN\s+/, '');
      return nameShort === wantedShort || codeShort === wantedShort;
    });
  }

  /** Ensure the Excel hierarchy exists before stock is planned. Warehouse headings are
   * ERP branches; the columns beneath them are ERP godowns. This operation is idempotent
   * and restores an exact soft-deleted master instead of creating a duplicate. */
  private async ensureLocationMasters(db: Prisma.TransactionClient, report: ExcelReport, actorId: string) {
    const allBranches = await db.branch.findMany({ include: { godowns: true } });
    const activeCompanies = await db.company.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { createdAt: 'asc' } });
    const dglCompanyId = allBranches.find(branch => branch.code === 'DGL')?.companyId;
    const companyId = dglCompanyId ?? (activeCompanies.length === 1 ? activeCompanies[0].id : undefined);
    if (!companyId) throw new ValidationError('A single active company or an existing DGL branch is required to create warehouse masters.');

    for (const warehouse of WAREHOUSES) {
      const excelLocations = report.locations.filter(location => location.warehouse === warehouse.header);
      if (!excelLocations.length) continue;
      const candidates = allBranches.filter(branch => {
        const text = normalizeLocation(`${branch.code} ${branch.name} ${branch.city ?? ''}`);
        const excluded = 'excludes' in warehouse && warehouse.excludes.some(alias => text.includes(alias));
        return !excluded && (branch.code === warehouse.code || warehouse.aliases.some(alias => text.includes(alias)));
      });
      if (candidates.length > 1) throw new ValidationError(`Multiple ERP branches match ${warehouse.header}. Correct the branch masters before importing.`);
      let branch = candidates[0];
      if (!branch) {
        branch = await db.branch.create({ data: { companyId, name: warehouse.name, code: warehouse.code, createdBy: actorId }, include: { godowns: true } });
        allBranches.push(branch);
      } else if (!branch.isActive || branch.deletedAt) {
        branch = await db.branch.update({ where: { id: branch.id }, data: { isActive: true, deletedAt: null, deletedBy: null, updatedBy: actorId }, include: { godowns: true } });
        allBranches.splice(allBranches.findIndex(item => item.id === branch.id), 1, branch);
      }
      await db.userBranch.upsert({ where: { userId_branchId: { userId: actorId, branchId: branch.id } }, create: { userId: actorId, branchId: branch.id }, update: {} });

      for (const location of excelLocations) {
        const wanted = normalizeLocation(location.godown);
        const masterName = this.godownMasterName(warehouse.header, location.godown);
        const matches = this.matchGodowns(branch.godowns, location.godown, masterName);
        if (matches.length > 1) throw new ValidationError(`Multiple godowns in ${branch.name} match ${location.godown}. Correct the godown masters before importing.`);
        const match = matches[0];
        if (match) {
          if (!match.isActive || match.deletedAt || (/^\d+$/.test(wanted) && normalizeLocation(match.name) !== masterName)) {
            await db.godown.update({ where: { id: match.id }, data: { name: masterName, isActive: true, deletedAt: null, deletedBy: null, updatedBy: actorId } });
          }
          continue;
        }
        const code = this.masterCode(location.godown);
        const reserved = branch.godowns.find(godown => godown.code === code);
        if (reserved) {
          await db.godown.update({ where: { id: reserved.id }, data: { name: masterName, isActive: true, deletedAt: null, deletedBy: null, updatedBy: actorId } });
        } else {
          const created = await db.godown.create({ data: { branchId: branch.id, name: masterName, code, createdBy: actorId } });
          branch.godowns.push(created);
        }
      }
    }
  }

  private async parse(buffer: Buffer, fileName: string): Promise<ExcelReport> {
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ValidationError('The workbook has no worksheet.');
    let headerRow = 0;
    for (let row = 1; row <= Math.min(sheet.rowCount, 30); row++) {
      const values = sheet.getRow(row).values as unknown[];
      if (values.some(v => normalizeLocation(this.cell(v)) === 'VARIATION ID')) { headerRow = row; break; }
    }
    if (!headerRow) throw new ValidationError('This is not a supported SixOrbit Variations Export: Variation Id heading was not found.');
    const headers = new Map<string, number[]>();
    sheet.getRow(headerRow).eachCell((cell, col) => {
      const key = normalizeLocation(this.cell(cell.value));
      if (key) headers.set(key, [...(headers.get(key) ?? []), col]);
    });
    const variationCol = headers.get('VARIATION ID')?.[0];
    const nameCol = headers.get('VARIATION NAME')?.[0] ?? headers.get('ITEM NAME')?.[0];
    const unitCol = headers.get('UOM')?.[0];
    if (!variationCol || !nameCol || !unitCol) throw new ValidationError('Variation Id, Item/Variation Name, or UOM column is missing.');
    const warehouseColumns: { warehouse: string; column: number }[] = [];
    for (const warehouse of WAREHOUSES) {
      const columns = headers.get(warehouse.header) ?? [];
      // ASSART GODOWN appears twice: once as a Dindigul godown and once as its own
      // warehouse. The last occurrence is the warehouse total; the earlier one remains
      // inside Dindigul's godown range.
      if (columns.length) warehouseColumns.push({ warehouse: warehouse.header, column: columns[columns.length - 1] });
    }
    warehouseColumns.sort((a, b) => a.column - b.column);
    if (!warehouseColumns.length) throw new ValidationError('No supported warehouse stock columns were found.');
    const totalStockColumn = headers.get('TOTAL STOCK')?.[0] ?? Number.MAX_SAFE_INTEGER;
    const locations: ExcelLocation[] = [];
    for (let index = 0; index < warehouseColumns.length; index++) {
      const current = warehouseColumns[index];
      const end = Math.min(warehouseColumns[index + 1]?.column ?? totalStockColumn, totalStockColumn);
      for (let column = current.column + 1; column < end; column++) {
        const godown = normalizeLocation(this.cell(sheet.getRow(headerRow).getCell(column).value));
        if (!godown) continue;
        locations.push({ key: `${current.warehouse}::${godown}`, warehouse: current.warehouse, godown, column, totalColumn: current.column });
      }
    }
    if (!locations.length) throw new ValidationError('No godown columns were found under the warehouse totals.');
    const rows: ExcelStockRow[] = [];
    for (let rowNo = headerRow + 1; rowNo <= sheet.rowCount; rowNo++) {
      const row = sheet.getRow(rowNo);
      const itemId = this.cell(row.getCell(variationCol).value).replace(/\.0+$/, '');
      if (!itemId) continue;
      const quantities: Record<string, string> = {};
      const totals: Record<string, string> = {};
      for (const location of locations) {
        const raw = this.cell(row.getCell(location.column).value).replace(/,/g, '');
        quantities[location.key] = raw === '' ? '0' : raw;
        const total = this.cell(row.getCell(location.totalColumn).value).replace(/,/g, '');
        totals[location.warehouse] = total === '' ? '0' : total;
      }
      // SixOrbit's Variations Export stock columns are always physical pieces. The
      // product UOM column describes the catalogue item and must not be used as the
      // stock quantity unit here.
      rows.push({ itemId, name: this.cell(row.getCell(nameCol).value), unit: 'PCS', quantities, totals });
    }
    if (!rows.length) throw new ValidationError('The workbook contains no variation stock rows.');
    return { source: 'SIXORBIT_VARIATIONS_EXCEL', formatVersion: 3, fileName, locations, rows };
  }

  private async plan(db: Prisma.TransactionClient, report: ExcelReport) {
    const [products, branches, balances] = await Promise.all([
      db.product.findMany({ where: { deletedAt: null, sixorbitId: { not: null } }, select: { id: true, sixorbitId: true, name: true, baseUom: true, piecesPerBox: true, sqftPerBox: true } }),
      db.branch.findMany({ where: { deletedAt: null, isActive: true }, include: { godowns: { where: { deletedAt: null, isActive: true }, orderBy: { name: 'asc' } } } }),
      db.stockBalance.findMany(),
    ]);
    const productsByExternalId = new Map(products.map(product => [String(product.sixorbitId), product]));
    const branchLocations = new Map<string, { branchId: string; branch: string; godownId: string; godown: string }>();
    const issues: Issue[] = [];
    for (const warehouse of WAREHOUSES) {
      const excelLocations = report.locations.filter(location => location.warehouse === warehouse.header);
      if (!excelLocations.length) continue;
      const candidates = branches.filter(branch => {
        const text = normalizeLocation(`${branch.code} ${branch.name} ${branch.city ?? ''}`);
        const excluded = 'excludes' in warehouse && warehouse.excludes.some(alias => text.includes(alias));
        return !excluded && warehouse.aliases.some(alias => text.includes(alias));
      });
      if (candidates.length !== 1) {
        issues.push({ itemId: '', product: '', warehouse: warehouse.header, reason: candidates.length ? 'Multiple ERP branches match this warehouse' : 'No active ERP branch matches this warehouse' });
        continue;
      }
      const branch = candidates[0];
      for (const excelLocation of excelLocations) {
        const masterName = this.godownMasterName(warehouse.header, excelLocation.godown);
        const godowns = this.matchGodowns(branch.godowns, excelLocation.godown, masterName);
        if (godowns.length !== 1) {
          issues.push({ itemId: '', product: '', warehouse: `${warehouse.header} / ${excelLocation.godown}`, reason: godowns.length ? 'Multiple ERP godowns match this Excel godown' : 'No active ERP godown matches this Excel godown' });
          continue;
        }
        branchLocations.set(excelLocation.key, { branchId: branch.id, branch: branch.name, godownId: godowns[0].id, godown: godowns[0].name });
      }
    }
    const totals = new Map<string, Prisma.Decimal>();
    for (const balance of balances) {
      const key = `${balance.productId}|${balance.godownId}`;
      totals.set(key, (totals.get(key) ?? new Prisma.Decimal(0)).add(balance.qtyBoxes));
    }
    const lines: PlannedLine[] = [];
    const seen = new Set<string>();
    for (const row of report.rows) {
      const product = productsByExternalId.get(row.itemId);
      if (!product) {
        issues.push({ itemId: row.itemId, product: row.name, warehouse: '', reason: 'Product not linked in ERP; import the product first' });
        continue;
      }
      for (const excelLocation of report.locations) {
        const sourceQty = row.quantities[excelLocation.key] ?? '0';
        const location = branchLocations.get(excelLocation.key);
        if (!location) continue;
        const key = `${product.id}|${location.godownId}`;
        if (seen.has(key)) {
          issues.push({ itemId: row.itemId, product: row.name, warehouse: `${excelLocation.warehouse} / ${excelLocation.godown}`, reason: 'Duplicate product row in workbook' });
          continue;
        }
        seen.add(key);
        try {
          const target = inventoryQuantity({ item_id: row.itemId, item_name: row.name, warehouse: excelLocation.warehouse, section: excelLocation.godown, stock: sourceQty, allocated_stock: '0', unit: row.unit }, product);
          if (!target.isFinite() || target.isNaN()) throw new Error('Stock conversion produced an invalid quantity; check pieces per box');
          const current = totals.get(key) ?? new Prisma.Decimal(0);
          if (!current.isFinite() || current.isNaN()) throw new Error('ERP contains an invalid stock balance');
          lines.push({ productId: product.id, itemId: row.itemId, product: row.name || product.name, warehouse: `${excelLocation.warehouse} / ${excelLocation.godown}`, unit: row.unit, sourceQty, target, current, ...location });
        } catch (error) {
          issues.push({ itemId: row.itemId, product: row.name, warehouse: `${excelLocation.warehouse} / ${excelLocation.godown}`, reason: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    const locations = [...branchLocations].map(([key, location]) => ({ warehouse: report.locations.find(item => item.key === key)?.warehouse ?? key, branch: location.branch, godown: location.godown }));
    const summary = {
      fileName: report.fileName, products: report.rows.length, matched: lines.length, skipped: issues.length,
      adjustments: lines.filter(line => !line.target.equals(line.current)).length,
      unchanged: lines.filter(line => line.target.equals(line.current)).length,
      locations, issues,
    };
    return { lines, summary };
  }

  async preview(file: { buffer: Buffer; originalname: string }, actorId: string) {
    if (!file?.buffer?.length) throw new ValidationError('Choose a SixOrbit .xlsx file.');
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) throw new ValidationError('Only .xlsx files are supported.');
    const report = await this.parse(file.buffer, file.originalname);
    return this.prisma.$transaction(async tx => {
      await this.ensureLocationMasters(tx, report, actorId);
      const { summary } = await this.plan(tx, report);
      const today = inventoryToday();
      const run = await tx.sixOrbitInventoryRun.create({ data: { startDate: today, endDate: today, report: json(report), summary: json(summary), createdBy: actorId } });
      return { id: run.id, status: run.status, ...summary };
    });
  }

  async apply(id: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9172026)`;
      const run = await tx.sixOrbitInventoryRun.findUnique({ where: { id } });
      if (!run) throw new NotFoundError('Excel stock import not found');
      const report = run.report as unknown as ExcelReport;
      if (report.source !== 'SIXORBIT_VARIATIONS_EXCEL' || report.formatVersion !== 3) throw new ValidationError('This preview uses an older stock-unit format. Upload the workbook again so every stock quantity is read as PCS.');
      if (run.status === 'APPLIED') return { id, status: run.status, ...(run.summary as object) };
      if (Date.now() - run.createdAt.getTime() > 30 * 60 * 1000) throw new ConflictError('Preview expired. Upload the workbook again.');
      await tx.$executeRawUnsafe('LOCK TABLE stock_movements, stock_balances IN SHARE ROW EXCLUSIVE MODE');
      await this.ensureLocationMasters(tx, report, actorId);
      const plan = await this.plan(tx, report);
      const productIds = [...new Set(plan.lines.map(line => line.productId))];
      if (productIds.length && await tx.stockMovement.findFirst({ where: { createdAt: { gt: run.createdAt }, productId: { in: productIds } }, select: { id: true } })) throw new ConflictError('ERP stock changed after the preview. Upload the workbook again.');
      const now = new Date();
      for (const line of plan.lines.filter(value => !value.target.equals(value.current))) {
        const liveBalances = await tx.stockBalance.findMany({ where: { productId: line.productId, branchId: line.branchId, godownId: line.godownId } });
        const liveCurrent = liveBalances.reduce((total, balance) => total.add(balance.qtyBoxes), new Prisma.Decimal(0));
        const delta = line.target.sub(liveCurrent);
        if (!line.target.isFinite() || line.target.isNaN() || !liveCurrent.isFinite() || liveCurrent.isNaN() || !delta.isFinite() || delta.isNaN()) {
          throw new ValidationError(`Invalid stock conversion for ${line.product} in ${line.warehouse}. Upload a fresh preview and review its skipped items.`);
        }
        if (!delta.isZero()) {
          await tx.stockMovement.create({ data: {
            id: randomUUID(), productId: line.productId, branchId: line.branchId, godownId: line.godownId,
            type: 'ADJUSTMENT', direction: delta.gt(0) ? 'IN' : 'OUT', qtyBoxes: delta.abs(),
            refType: 'SIXORBIT_EXCEL', refId: id, reason: 'Reconcile godown stock from SixOrbit Variations Export',
            remarks: `${line.sourceQty} ${line.unit} in ${line.warehouse}; previous ${liveCurrent.toString()} ${line.unit}`,
            movementDate: now, createdBy: actorId,
          } });
        }
        if (liveBalances.length) await tx.stockBalance.deleteMany({ where: { id: { in: liveBalances.map(balance => balance.id) } } });
        if (line.target.gt(0)) await tx.stockBalance.create({ data: { productId: line.productId, branchId: line.branchId, godownId: line.godownId, qtyBoxes: line.target } });
      }
      await tx.sixOrbitInventoryRun.update({ where: { id }, data: { status: 'APPLIED', appliedAt: now, summary: json(plan.summary) } });
      return { id, status: 'APPLIED', ...plan.summary };
    }, { timeout: 120000, maxWait: 10000 });
  }
}
