import type { AvailableStockItem, UUID } from '@tiles-erp/shared-types';
import type { PrismaService } from '../../../core/prisma/prisma.service';

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const stockKey = (
  productId: string,
  branchId: string,
  godownId: string,
  batchNo: string | null,
  shade: string | null,
): string => `${productId}|${branchId}|${godownId}|${batchNo ?? ''}|${shade ?? ''}`;

/**
 * Free stock, per godown: what is on hand less what confirmed orders already hold.
 *
 * Quoting and ordering both need this answer, so the query lives in one place rather
 * than being written twice with a risk of the two drifting apart.
 *
 * `branchIds` is a list because an order may be allowed to draw from more than its own
 * branch. The rows carry their branch, and the caller decides the preference — this
 * query only reports what exists.
 */
export async function queryAvailableStock(
  prisma: PrismaService,
  branchIds: UUID[],
  productIds: UUID[],
): Promise<AvailableStockItem[]> {
  if (productIds.length === 0 || branchIds.length === 0) return [];

  const [balances, held, godowns, branches] = await Promise.all([
    // Summed across gates. A gate is a loading point inside a godown, not a place stock
    // is sold from — and returning a row per gate produced two entries with the same
    // key, so the second silently replaced the first and half the stock vanished.
    prisma.stockBalance.groupBy({
      by: ['productId', 'branchId', 'godownId', 'batchNo', 'shade'],
      where: { branchId: { in: branchIds }, productId: { in: productIds }, qtyBoxes: { gt: 0 } },
      _sum: { qtyBoxes: true },
      orderBy: [{ branchId: 'asc' }, { godownId: 'asc' }, { batchNo: 'asc' }],
    }),
    prisma.stockReservation.groupBy({
      by: ['productId', 'branchId', 'godownId', 'batchNo', 'shade'],
      where: { branchId: { in: branchIds }, productId: { in: productIds }, status: 'ACTIVE' },
      _sum: { qtyBoxes: true },
    }),
    prisma.godown.findMany({
      where: { branchId: { in: branchIds }, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.branch.findMany({
      where: { id: { in: branchIds }, deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);

  const nameByGodown = new Map(godowns.map((godown) => [godown.id, godown.name]));
  const nameByBranch = new Map(branches.map((branch) => [branch.id, branch.name]));
  const heldByKey = new Map(
    held.map((row) => [
      stockKey(row.productId, row.branchId, row.godownId, row.batchNo, row.shade),
      Number(row._sum.qtyBoxes ?? 0),
    ]),
  );

  return balances.map((balance) => {
    const onHandQtyBoxes = Number(balance._sum.qtyBoxes ?? 0);
    const reservedQtyBoxes =
      heldByKey.get(
        stockKey(
          balance.productId,
          balance.branchId,
          balance.godownId,
          balance.batchNo,
          balance.shade,
        ),
      ) ?? 0;
    return {
      productId: balance.productId,
      branchId: balance.branchId,
      branchName: nameByBranch.get(balance.branchId) ?? 'Unknown branch',
      godownId: balance.godownId,
      godownName: nameByGodown.get(balance.godownId) ?? 'Unknown godown',
      batchNo: balance.batchNo,
      shade: balance.shade,
      onHandQtyBoxes,
      reservedQtyBoxes: round3(reservedQtyBoxes),
      availableQtyBoxes: round3(Math.max(onHandQtyBoxes - reservedQtyBoxes, 0)),
    };
  });
}
