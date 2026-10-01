import { Prisma } from '@prisma/client';

export interface InventoryRow {
  item_id: string; item_number?: string; item_name: string;
  warehouse: string; section?: string | null; stock: string; allocated_stock: string;
  unit: string; stock_date?: string;
  [key: string]: unknown;
}
export const normalizeLocation = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();
export const locationKey = (r: InventoryRow) => JSON.stringify([normalizeLocation(r.warehouse), normalizeLocation(r.section || 'MAIN GODOWN')]);
export function inventoryQuantity(row: InventoryRow, product: { baseUom: string; piecesPerBox: number; sqftPerBox: Prisma.Decimal }): Prisma.Decimal {
  if (!/^-?\d+(\.\d+)?$/.test(String(row.stock))) throw new Error('Invalid stock quantity');
  const qty = new Prisma.Decimal(row.stock);
  if (qty.isNegative()) throw new Error('Negative stock requires review');
  const unit = normalizeLocation(row.unit);
  const source = ['PCS', 'NOS', 'PIECE', 'PIECES'].includes(unit) ? 'PIECE' : unit === 'BOX' ? 'BOX' : unit === 'SQFT' ? 'SQFT' : null;
  if (!source) throw new Error(`Unsupported unit: ${row.unit}`);
  const ppb = new Prisma.Decimal(product.piecesPerBox);
  const sqft = product.sqftPerBox;
  let result = qty;
  if (source !== product.baseUom) {
    if ((source === 'PIECE' || product.baseUom === 'PIECE') && !ppb.isPositive()) throw new Error('Pieces per box is missing');
    if ((source === 'SQFT' || product.baseUom === 'SQFT') && !sqft.isPositive()) throw new Error('Square feet per box is missing');
    const boxes = source === 'PIECE' ? qty.div(ppb) : source === 'SQFT' ? qty.div(sqft) : qty;
    result = product.baseUom === 'PIECE' ? boxes.mul(ppb) : product.baseUom === 'SQFT' ? boxes.mul(sqft) : boxes;
  }
  result = result.toDecimalPlaces(3);
  if (result.abs().gte('100000000000')) throw new Error('Quantity exceeds stock precision');
  return result;
}
