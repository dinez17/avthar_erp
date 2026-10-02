import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.env.APPLY_SHOWROOM_ALLOCATION === 'true';
const runMarker = 'SHOWROOM INITIAL ALLOCATION 2026-10-02';
const round3 = (value: number): number => Math.round(value * 1000) / 1000;
const dimensionKey = (
  productId: string,
  branchId: string,
  godownId: string,
  batchNo: string | null,
  shade: string | null,
): string => [productId, branchId, godownId, batchNo ?? '', shade ?? ''].join('|');

async function main(): Promise<void> {
  const previous = await prisma.stockTransfer.count({ where: { remarks: runMarker } });
  if (previous > 0) {
    throw new Error(`${runMarker} has already been applied (${previous} transfer documents).`);
  }

  const branches = await prisma.branch.findMany({
    where: { deletedAt: null, isActive: true, name: { not: 'AVTHAR CERAMICS - DGL' } },
    include: {
      godowns: {
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true, code: true, allowBilling: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const summary: Array<{ branch: string; products: number; boxes: number; transfers: number }> = [];
  const plans: Array<{
    branchId: string;
    branchName: string;
    sourceGodownId: string;
    sourceCode: string;
    displayGodownId: string;
    allocations: Array<{
      balanceId: string;
      productId: string;
      gateId: string | null;
      batchNo: string | null;
      shade: string | null;
      qtyBoxes: number;
      rate: number;
      gstRate: number;
    }>;
  }> = [];

  for (const branch of branches) {
    const display = branch.godowns.find((godown) => godown.code === 'SHOWROOM-DISPLAY');
    if (!display) throw new Error(`${branch.name}: SHOWROOM DISPLAY godown is missing.`);
    const sources = branch.godowns.filter((godown) => godown.allowBilling);
    const sourceIds = sources.map((godown) => godown.id);
    if (sourceIds.length === 0) {
      summary.push({ branch: branch.name, products: 0, boxes: 0, transfers: 0 });
      continue;
    }

    const [balances, reservations] = await Promise.all([
      prisma.stockBalance.findMany({
        where: { branchId: branch.id, godownId: { in: sourceIds }, qtyBoxes: { gt: 0 } },
        select: {
          id: true, productId: true, godownId: true, gateId: true, batchNo: true, shade: true,
          qtyBoxes: true,
          product: { select: { landingCost: true, gstRate: true } },
        },
        orderBy: [{ productId: 'asc' }, { godownId: 'asc' }, { updatedAt: 'asc' }],
      }),
      prisma.stockReservation.findMany({
        where: { branchId: branch.id, godownId: { in: sourceIds }, status: 'ACTIVE' },
        select: {
          productId: true, branchId: true, godownId: true, batchNo: true, shade: true,
          qtyBoxes: true,
        },
      }),
    ]);
    const reserved = new Map<string, number>();
    for (const row of reservations) {
      const key = dimensionKey(
        row.productId, row.branchId, row.godownId, row.batchNo, row.shade,
      );
      reserved.set(key, round3((reserved.get(key) ?? 0) + Number(row.qtyBoxes)));
    }

    const movedByProduct = new Map<string, number>();
    const allocationsBySource = new Map<string, typeof plans[number]['allocations']>();
    for (const balance of balances) {
      const alreadyMoved = movedByProduct.get(balance.productId) ?? 0;
      const stillNeeded = round3(5 - alreadyMoved);
      if (stillNeeded <= 0) continue;
      const key = dimensionKey(
        balance.productId, branch.id, balance.godownId, balance.batchNo, balance.shade,
      );
      const heldHere = Math.min(Number(balance.qtyBoxes), reserved.get(key) ?? 0);
      reserved.set(key, round3(Math.max((reserved.get(key) ?? 0) - heldHere, 0)));
      const free = round3(Math.max(Number(balance.qtyBoxes) - heldHere, 0));
      const qtyBoxes = round3(Math.min(free, stillNeeded));
      if (qtyBoxes <= 0) continue;
      const rows = allocationsBySource.get(balance.godownId) ?? [];
      rows.push({
        balanceId: balance.id,
        productId: balance.productId,
        gateId: balance.gateId,
        batchNo: balance.batchNo,
        shade: balance.shade,
        qtyBoxes,
        rate: Number(balance.product.landingCost ?? 0),
        gstRate: Number(balance.product.gstRate),
      });
      allocationsBySource.set(balance.godownId, rows);
      movedByProduct.set(balance.productId, round3(alreadyMoved + qtyBoxes));
    }

    for (const [sourceGodownId, allocations] of allocationsBySource) {
      const source = sources.find((godown) => godown.id === sourceGodownId);
      if (!source) throw new Error(`${branch.name}: source godown disappeared from the plan.`);
      plans.push({
        branchId: branch.id,
        branchName: branch.name,
        sourceGodownId,
        sourceCode: source.code,
        displayGodownId: display.id,
        allocations,
      });
    }
    summary.push({
      branch: branch.name,
      products: movedByProduct.size,
      boxes: round3([...movedByProduct.values()].reduce((sum, qty) => sum + qty, 0)),
      transfers: allocationsBySource.size,
    });
  }

  console.table(summary);
  console.log({
    apply,
    branches: summary.length,
    products: summary.reduce((sum, row) => sum + row.products, 0),
    boxes: round3(summary.reduce((sum, row) => sum + row.boxes, 0)),
    transferDocuments: plans.length,
  });
  if (!apply) return;

  await prisma.$transaction(async (tx) => {
    if (await tx.stockTransfer.count({ where: { remarks: runMarker } })) {
      throw new Error(`${runMarker} was applied by another process.`);
    }
    // Re-read stock and active reservations inside the serializable transaction so stock
    // reserved after the preview cannot be moved into the showroom display.
    const branchPlans = new Map<string, typeof plans>();
    for (const plan of plans) {
      const rows = branchPlans.get(plan.branchId) ?? [];
      rows.push(plan);
      branchPlans.set(plan.branchId, rows);
    }
    for (const [branchId, rows] of branchPlans) {
      const sourceGodownIds = [...new Set(rows.map((row) => row.sourceGodownId))];
      const [currentBalances, currentReservations] = await Promise.all([
        tx.stockBalance.findMany({
          where: { branchId, godownId: { in: sourceGodownIds }, qtyBoxes: { gt: 0 } },
          select: { productId: true, branchId: true, godownId: true, batchNo: true, shade: true, qtyBoxes: true },
        }),
        tx.stockReservation.findMany({
          where: { branchId, godownId: { in: sourceGodownIds }, status: 'ACTIVE' },
          select: { productId: true, branchId: true, godownId: true, batchNo: true, shade: true, qtyBoxes: true },
        }),
      ]);
      const stock = new Map<string, number>();
      const held = new Map<string, number>();
      const moving = new Map<string, number>();
      for (const row of currentBalances) {
        const key = dimensionKey(row.productId, row.branchId, row.godownId, row.batchNo, row.shade);
        stock.set(key, round3((stock.get(key) ?? 0) + Number(row.qtyBoxes)));
      }
      for (const row of currentReservations) {
        const key = dimensionKey(row.productId, row.branchId, row.godownId, row.batchNo, row.shade);
        held.set(key, round3((held.get(key) ?? 0) + Number(row.qtyBoxes)));
      }
      for (const plan of rows) for (const allocation of plan.allocations) {
        const key = dimensionKey(
          allocation.productId, plan.branchId, plan.sourceGodownId,
          allocation.batchNo, allocation.shade,
        );
        moving.set(key, round3((moving.get(key) ?? 0) + allocation.qtyBoxes));
      }
      for (const [key, qty] of moving) {
        if (round3((stock.get(key) ?? 0) - (held.get(key) ?? 0)) + 0.0001 < qty) {
          throw new Error('Available stock changed after preview; nothing was applied. Please run again.');
        }
      }
    }

    let sequence = 0;
    for (const plan of plans) {
      sequence += 1;
      const documentSuffix = String(sequence).padStart(3, '0');
      const lineGroups = new Map<string, {
        productId: string; batchNo: string | null; shade: string | null;
        qtyBoxes: number; rate: number; gstRate: number;
      }>();
      for (const allocation of plan.allocations) {
        const current = await tx.stockBalance.findUnique({
          where: { id: allocation.balanceId }, select: { qtyBoxes: true },
        });
        if (!current || Number(current.qtyBoxes) + 0.0001 < allocation.qtyBoxes) {
          throw new Error(`${plan.branchName}: stock changed after preview; nothing was applied.`);
        }
        const changed = await tx.stockBalance.updateMany({
          where: { id: allocation.balanceId, qtyBoxes: { gte: allocation.qtyBoxes } },
          data: { qtyBoxes: { decrement: allocation.qtyBoxes } },
        });
        if (changed.count !== 1) {
          throw new Error(`${plan.branchName}: could not reserve source stock; nothing was applied.`);
        }
        const lineKey = [allocation.productId, allocation.batchNo ?? '', allocation.shade ?? ''].join('|');
        const line = lineGroups.get(lineKey);
        if (line) line.qtyBoxes = round3(line.qtyBoxes + allocation.qtyBoxes);
        else lineGroups.set(lineKey, {
          productId: allocation.productId, batchNo: allocation.batchNo, shade: allocation.shade,
          qtyBoxes: allocation.qtyBoxes, rate: allocation.rate, gstRate: allocation.gstRate,
        });
      }

      const lines = [...lineGroups.values()].map((line) => ({
        ...line,
        lineSubTotal: Math.round(line.qtyBoxes * line.rate * 100) / 100,
      }));
      const subTotal = Math.round(lines.reduce((sum, line) => sum + line.lineSubTotal, 0) * 100) / 100;
      const transfer = await tx.stockTransfer.create({ data: {
        transferNo: `SD-20261002-${documentSuffix}`,
        documentNo: `SD-20261002-${documentSuffix}`,
        documentType: 'DELIVERY_CHALLAN', status: 'RECEIVED',
        fromBranchId: plan.branchId, fromGodownId: plan.sourceGodownId,
        toBranchId: plan.branchId, toGodownId: plan.displayGodownId,
        interState: false, remarks: runMarker,
        subTotal, grandTotal: subTotal,
        receivedAt: new Date(), receivedByName: 'Initial showroom allocation',
        receiptRemarks: runMarker,
        lines: { create: lines.map((line) => ({
          productId: line.productId, batchNo: line.batchNo, shade: line.shade,
          qtyBoxes: line.qtyBoxes, qtyReceived: line.qtyBoxes,
          rate: line.rate, gstRate: line.gstRate,
          lineSubTotal: line.lineSubTotal, lineGst: 0, lineTotal: line.lineSubTotal,
        })) },
      } });

      for (const allocation of plan.allocations) {
        const destination = await tx.stockBalance.findFirst({ where: {
          productId: allocation.productId, branchId: plan.branchId,
          godownId: plan.displayGodownId, gateId: null,
          batchNo: allocation.batchNo, shade: allocation.shade,
        }, select: { id: true } });
        if (destination) {
          await tx.stockBalance.update({
            where: { id: destination.id }, data: { qtyBoxes: { increment: allocation.qtyBoxes } },
          });
        } else {
          await tx.stockBalance.create({ data: {
            productId: allocation.productId, branchId: plan.branchId,
            godownId: plan.displayGodownId, gateId: null,
            batchNo: allocation.batchNo, shade: allocation.shade, qtyBoxes: allocation.qtyBoxes,
          } });
        }
        await tx.stockMovement.createMany({ data: [
          {
            productId: allocation.productId, branchId: plan.branchId,
            godownId: plan.sourceGodownId, gateId: allocation.gateId,
            batchNo: allocation.batchNo, shade: allocation.shade,
            type: 'TRANSFER_OUT', direction: 'OUT', qtyBoxes: allocation.qtyBoxes,
            refType: 'TRANSFER', refId: transfer.id, refNumber: transfer.documentNo,
            reason: 'SHOWROOM_DISPLAY', remarks: runMarker,
          },
          {
            productId: allocation.productId, branchId: plan.branchId,
            godownId: plan.displayGodownId, gateId: null,
            batchNo: allocation.batchNo, shade: allocation.shade,
            type: 'TRANSFER_IN', direction: 'IN', qtyBoxes: allocation.qtyBoxes,
            refType: 'TRANSFER', refId: transfer.id, refNumber: transfer.documentNo,
            reason: 'SHOWROOM_DISPLAY', remarks: runMarker,
          },
        ] });
      }
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 300_000 });

  console.log(`${runMarker} applied successfully.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
