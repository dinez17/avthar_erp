import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  CreateGoodsReceiptInput,
  GoodsReceiptItem,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';
import {
  GOODS_RECEIPT_REPOSITORY,
  type GoodsReceiptRepository,
  type ReceiptFilter,
  type ResolvedReceiptLine,
} from '../domain/goods-receipt.repository';
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepository,
} from '../domain/purchase-order.repository';

const MAX_LINES = 200;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export class ListGoodsReceiptsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: ReceiptFilter,
  ) {}
}

export class GetGoodsReceiptQuery {
  constructor(public readonly id: UUID) {}
}

export class PostGoodsReceiptCommand {
  constructor(
    public readonly data: CreateGoodsReceiptInput,
    public readonly actorId: UUID,
  ) {}
}

@QueryHandler(ListGoodsReceiptsQuery)
export class ListGoodsReceiptsHandler
  implements IQueryHandler<ListGoodsReceiptsQuery, Paginated<GoodsReceiptItem>>
{
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY) private readonly receipts: GoodsReceiptRepository,
  ) {}

  execute(query: ListGoodsReceiptsQuery): Promise<Paginated<GoodsReceiptItem>> {
    return this.receipts.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetGoodsReceiptQuery)
export class GetGoodsReceiptHandler
  implements IQueryHandler<GetGoodsReceiptQuery, GoodsReceiptItem>
{
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY) private readonly receipts: GoodsReceiptRepository,
  ) {}

  async execute(query: GetGoodsReceiptQuery): Promise<GoodsReceiptItem> {
    const receipt = await this.receipts.findById(query.id);
    if (!receipt) throw new NotFoundError('Goods receipt not found');
    return receipt;
  }
}

/**
 * Posts a goods receipt. When linked to a purchase order the receipt is validated
 * against that order's pending quantities; the repository then writes the receipt,
 * posts stock IN and rolls the order status forward atomically.
 */
@CommandHandler(PostGoodsReceiptCommand)
export class PostGoodsReceiptHandler
  implements ICommandHandler<PostGoodsReceiptCommand, GoodsReceiptItem>
{
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY) private readonly receipts: GoodsReceiptRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
  ) {}

  async execute(command: PostGoodsReceiptCommand): Promise<GoodsReceiptItem> {
    const { orderId, supplierId, branchId, godownId, lines } = command.data;

    if (lines.length === 0) throw new ValidationError('At least one line is required');
    if (lines.length > MAX_LINES) {
      throw new ValidationError(`At most ${MAX_LINES} lines per receipt`);
    }

    await this.receipts.assertEndpoints(supplierId, branchId, godownId);

    let resolved: ResolvedReceiptLine[];

    if (orderId) {
      const order = await this.orders.findById(orderId);
      if (!order) throw new NotFoundError('Purchase order not found');
      if (order.status !== 'APPROVED' && order.status !== 'PARTIALLY_RECEIVED') {
        throw new ValidationError(
          `Goods can only be received against approved orders (this one is ${order.status})`,
        );
      }
      if (order.supplierId !== supplierId) {
        throw new ValidationError('Receipt supplier does not match the order supplier');
      }
      if (order.branchId !== branchId) {
        throw new ValidationError('Receipt branch does not match the order branch');
      }

      const orderLines = new Map((order.lines ?? []).map((line) => [line.id, line]));
      const receivedSoFar = new Map<string, number>();

      resolved = lines.map((line) => {
        if (!line.orderLineId) {
          throw new ValidationError('Every line of an order-linked receipt must name an order line');
        }
        const orderLine = orderLines.get(line.orderLineId);
        if (!orderLine) throw new ValidationError('One or more order lines were not found');
        if (line.qtyBoxes <= 0) {
          throw new ValidationError(`${orderLine.sku}: quantity must be greater than zero`);
        }

        const already = receivedSoFar.get(line.orderLineId) ?? 0;
        const totalForLine = round3(already + line.qtyBoxes);
        if (totalForLine > orderLine.pendingBoxes) {
          throw new ValidationError(
            `${orderLine.sku}: only ${orderLine.pendingBoxes} boxes pending, cannot receive ${totalForLine}`,
          );
        }
        receivedSoFar.set(line.orderLineId, totalForLine);

        return {
          orderLineId: line.orderLineId,
          productId: orderLine.productId,
          batchNo: line.batchNo ?? null,
          shade: line.shade ?? null,
          qtyBoxes: line.qtyBoxes,
          rate: line.rate ?? orderLine.rate,
        };
      });
    } else {
      // Direct receipt with no order behind it.
      const gstRates = await this.orders.productGstRates(lines.map((l) => l.productId));
      resolved = lines.map((line) => {
        const product = gstRates.get(line.productId);
        if (!product) throw new ValidationError('One or more products no longer exist');
        if (line.qtyBoxes <= 0) {
          throw new ValidationError(`${product.sku}: quantity must be greater than zero`);
        }
        if (line.rate === undefined) {
          throw new ValidationError(`${product.sku}: a rate is required on direct receipts`);
        }
        return {
          orderLineId: null,
          productId: line.productId,
          batchNo: line.batchNo ?? null,
          shade: line.shade ?? null,
          qtyBoxes: line.qtyBoxes,
          rate: line.rate,
        };
      });
    }

    const grnNumber = await this.receipts.nextGrnNumber(branchId);
    return this.receipts.post({
      grnNumber,
      orderId: orderId ?? null,
      supplierId,
      branchId,
      godownId,
      receiptDate: command.data.receiptDate ? new Date(command.data.receiptDate) : new Date(),
      supplierInvoiceNo: command.data.supplierInvoiceNo ?? null,
      remarks: command.data.remarks ?? null,
      createdBy: command.actorId,
      lines: resolved,
    });
  }
}
