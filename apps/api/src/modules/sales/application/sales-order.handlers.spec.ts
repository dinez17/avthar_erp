import { ValidationError } from '@tiles-erp/shared';
import type { AvailableStockItem, ProductPriceHint, SalesOrderItem } from '@tiles-erp/shared-types';
import {
  ConfirmSalesOrderCommand,
  ConfirmSalesOrderHandler,
  CreateSalesOrderCommand,
  CreateSalesOrderHandler,
  planReservations,
} from './sales-order.handlers';
import type { QuotationRepository } from '../domain/quotation.repository';
import type { SalesOrderRepository } from '../domain/sales-order.repository';

/** A user who may break either pricing rule, and one who may break neither. */
const NO_RIGHTS = { canOverridePrice: false, canSellBelowCost: false, canOverrideCredit: true };

const hint: ProductPriceHint = {
  productId: 'p1',
  sku: 'SKU-1',
  productName: 'Kajaria IVR',
  sizeMm: '600x600',
  piecesPerBox: 4,
  baseUom: 'BOX',
  mrp: 1600,
  gstRate: 18,
  landingCost: 1000,
  displayPrice: 1500,
  minSellingPrice: 1150,
  sellingPrice: 1250,
};

const stock = (
  godownId: string,
  available: number,
  batchNo: string | null = null,
  branchId = 'b1',
): AvailableStockItem => ({
  productId: 'p1',
  branchId,
  branchName: branchId,
  godownId,
  godownName: godownId,
  batchNo,
  shade: null,
  onHandQtyBoxes: available,
  reservedQtyBoxes: 0,
  availableQtyBoxes: available,
});

const mockOrders = (): jest.Mocked<SalesOrderRepository> => ({
  nextOrderNumber: jest.fn().mockResolvedValue('SO-2026-00001'),
  list: jest.fn(),
  findById: jest.fn(),
  create: jest.fn().mockResolvedValue({ id: 'o1' } as SalesOrderItem),
  update: jest.fn(),
  confirm: jest.fn().mockResolvedValue({ id: 'o1' } as SalesOrderItem),
  cancel: jest.fn(),
  softDelete: jest.fn(),
  credit: jest.fn().mockResolvedValue({
    name: 'Dinesh Traders',
    address: 'Dindigul',
    mobile: '9894477819',
    isActive: true,
    creditLimit: 0,
    creditDays: 30,
    committedValue: 0, outstanding: 0,
  }),
  assertBranch: jest.fn().mockResolvedValue(undefined),
  salesmanName: jest.fn().mockResolvedValue('Arun Kumar'),
  isSalesman: jest.fn().mockResolvedValue(false),
  availableStock: jest.fn().mockResolvedValue([]),
  sellableBranchIds: jest.fn().mockResolvedValue(['b1', 'b2']),
  splitPlan: jest.fn(),
  reservations: jest.fn(),
});

const mockQuotations = (): jest.Mocked<Pick<QuotationRepository, 'priceHints'>> => ({
  priceHints: jest.fn().mockResolvedValue(new Map([['p1', hint]])),
});

const quotationsPort = (): QuotationRepository =>
  mockQuotations() as unknown as QuotationRepository;

const base = { customerId: 'c1', branchId: 'b1' };

describe('planReservations', () => {
  const line = { id: 'l1', productId: 'p1', productName: 'Kajaria IVR', qtyBoxes: 10 };

  it('takes the whole quantity from one godown when it can', () => {
    const planned = planReservations([line], [stock('g1', 25)], 'b1');
    expect(planned).toEqual([
      expect.objectContaining({ godownId: 'g1', qtyBoxes: 10, salesOrderLineId: 'l1' }),
    ]);
  });

  it('splits across godowns, oldest batch first', () => {
    const planned = planReservations([line], [stock('g1', 4, 'B-1'), stock('g2', 30, 'B-2')], 'b1');
    expect(planned.map((p) => [p.godownId, p.qtyBoxes])).toEqual([
      ['g1', 4],
      ['g2', 6],
    ]);
  });

  it('never promises the same free stock to two lines', () => {
    const planned = planReservations(
      [
        { ...line, id: 'l1', qtyBoxes: 6 },
        { ...line, id: 'l2', qtyBoxes: 4 },
      ],
      [stock('g1', 10)],
      'b1',
    );
    expect(planned.map((p) => [p.salesOrderLineId, p.qtyBoxes])).toEqual([
      ['l1', 6],
      ['l2', 4],
    ]);

    // Only 10 boxes are free, so a second line asking for 6 more cannot be met.
    expect(() =>
      planReservations(
        [
          { ...line, id: 'l1', qtyBoxes: 6 },
          { ...line, id: 'l2', qtyBoxes: 6 },
        ],
        [stock('g1', 10)],
        'b1',
      ),
    ).toThrow(/short by 2 box/);
  });

  it('reports the shortfall instead of over-committing', () => {
    expect(() => planReservations([line], [stock('g1', 3)], 'b1')).toThrow(ValidationError);
    expect(() => planReservations([line], [stock('g1', 3)], 'b1')).toThrow(/short by 7 box/);
  });

  it('refuses a product with no stock at all in the branch', () => {
    expect(() => planReservations([line], [], 'b1')).toThrow(/short by 10 box/);
  });

  it('ignores another branch entirely when cross-branch is off', () => {
    expect(() =>
      planReservations([line], [stock('g9', 500, null, 'b2')], 'b1'),
    ).toThrow(/short by 10 box/);
  });

  it('names the branch holding the stock, so the refusal is actionable', () => {
    expect(() => planReservations([line], [stock('g9', 40, null, 'b2')], 'b1')).toThrow(
      /b2 has 40 box/,
    );
  });

  it('draws from another branch once cross-branch is allowed', () => {
    const planned = planReservations([line], [stock('g9', 40, null, 'b2')], 'b1', true);
    expect(planned).toEqual([
      expect.objectContaining({ branchId: 'b2', godownId: 'g9', qtyBoxes: 10 }),
    ]);
  });

  it('empties the home branch before touching another, however little it holds', () => {
    const planned = planReservations(
      [line],
      [stock('g9', 500, null, 'b2'), stock('g1', 4, null, 'b1')],
      'b1',
      true,
    );
    expect(planned.map((p) => [p.branchId, p.qtyBoxes])).toEqual([
      ['b1', 4],
      ['b2', 6],
    ]);
  });

  it('says the shortfall is everywhere when cross-branch is already on', () => {
    expect(() =>
      planReservations([line], [stock('g1', 2), stock('g9', 3, null, 'b2')], 'b1', true),
    ).toThrow(/across every branch/);
  });
});

describe('CreateSalesOrderHandler', () => {
  it('falls back to the branch selling price and prices GST on the discounted value', async () => {
    const orders = mockOrders();
    const handler = new CreateSalesOrderHandler(orders, quotationsPort());
    await handler.execute(
      new CreateSalesOrderCommand(
        { ...base, lines: [{ productId: 'p1', qtyBoxes: 10, rate: 0 }] },
        'actor-1',
        NO_RIGHTS,
      ),
    );
    const [, data] = orders.create.mock.calls[0]!;
    expect(data.lines[0]).toMatchObject({ rate: 1250, gstRate: 18 });
    expect(data.grandTotal).toBe(14750);
  });

  it('blocks a rate below the branch minimum unless the actor may override', async () => {
    const orders = mockOrders();
    const handler = new CreateSalesOrderHandler(orders, quotationsPort());
    const command = new CreateSalesOrderCommand(
      { ...base, lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1000 }] },
      'actor-1',
      NO_RIGHTS,
    );
    await expect(handler.execute(command)).rejects.toThrow(/below the branch minimum/);
  });

  it('credits the acting user when that user is a salesperson', async () => {
    const orders = mockOrders();
    orders.isSalesman.mockResolvedValue(true);
    const handler = new CreateSalesOrderHandler(orders, quotationsPort());
    await handler.execute(
      new CreateSalesOrderCommand(
        { ...base, salesmanUserId: 'someone-else', lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1250 }] },
        'actor-1',
        NO_RIGHTS,
      ),
    );
    const [, data] = orders.create.mock.calls[0]!;
    expect(data.salesmanUserId).toBe('actor-1');
  });

  it('refuses an inactive customer', async () => {
    const orders = mockOrders();
    orders.credit.mockResolvedValue({
      name: 'Closed Account',
      address: null,
      mobile: null,
      isActive: false,
      creditLimit: 0,
      creditDays: 0,
      committedValue: 0, outstanding: 0,
    });
    const handler = new CreateSalesOrderHandler(orders, quotationsPort());
    await expect(
      handler.execute(
        new CreateSalesOrderCommand(
          { ...base, lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1250 }] },
          'actor-1',
          NO_RIGHTS,
        ),
      ),
    ).rejects.toThrow(/inactive/);
  });
});

describe('ConfirmSalesOrderHandler', () => {
  const draft = {
    id: 'o1',
    status: 'DRAFT',
    branchId: 'b1',
    customerId: 'c1',
    grandTotal: 50000,
    lines: [
      { id: 'l1', productId: 'p1', productName: 'Kajaria IVR', qtyBoxes: 10 },
    ],
  } as unknown as SalesOrderItem;

  it('reserves stock and confirms', async () => {
    const orders = mockOrders();
    orders.findById.mockResolvedValue(draft);
    orders.availableStock.mockResolvedValue([stock('g1', 40)]);
    const handler = new ConfirmSalesOrderHandler(orders);

    await handler.execute(new ConfirmSalesOrderCommand('o1', 1, 'actor-1', false));

    const [, , reservations] = orders.confirm.mock.calls[0]!;
    expect(reservations).toEqual([
      expect.objectContaining({ godownId: 'g1', qtyBoxes: 10 }),
    ]);
  });

  it('stops when the credit limit would be breached', async () => {
    const orders = mockOrders();
    orders.findById.mockResolvedValue(draft);
    orders.credit.mockResolvedValue({
      name: 'Dinesh Traders',
      address: null,
      mobile: null,
      isActive: true,
      creditLimit: 60000,
      creditDays: 30,
      committedValue: 20000, outstanding: 0,
    });
    const handler = new ConfirmSalesOrderHandler(orders);

    await expect(
      handler.execute(new ConfirmSalesOrderCommand('o1', 1, 'actor-1', false)),
    ).rejects.toThrow(/Credit limit exceeded/);
    expect(orders.confirm).not.toHaveBeenCalled();
  });

  it('lets an approver confirm past the credit limit', async () => {
    const orders = mockOrders();
    orders.findById.mockResolvedValue(draft);
    orders.credit.mockResolvedValue({
      name: 'Dinesh Traders',
      address: null,
      mobile: null,
      isActive: true,
      creditLimit: 60000,
      creditDays: 30,
      committedValue: 20000, outstanding: 0,
    });
    orders.availableStock.mockResolvedValue([stock('g1', 40)]);
    const handler = new ConfirmSalesOrderHandler(orders);

    await handler.execute(new ConfirmSalesOrderCommand('o1', 1, 'approver', true));
    expect(orders.confirm).toHaveBeenCalled();
  });

  it('refuses to confirm an order twice', async () => {
    const orders = mockOrders();
    orders.findById.mockResolvedValue({ ...draft, status: 'CONFIRMED' } as SalesOrderItem);
    const handler = new ConfirmSalesOrderHandler(orders);

    await expect(
      handler.execute(new ConfirmSalesOrderCommand('o1', 1, 'actor-1', false)),
    ).rejects.toThrow(/Only draft orders can be confirmed/);
  });
});
