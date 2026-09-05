import type { InvoiceableLine, SalesInvoiceItem } from '@tiles-erp/shared-types';
import {
  CreateSalesInvoiceCommand,
  CreateSalesInvoiceHandler,
  PostSalesInvoiceCommand,
  PostSalesInvoiceHandler,
} from './sales-invoice.handlers';
import type { SalesInvoiceRepository } from '../domain/sales-invoice.repository';


/** A user who may break either pricing rule. */
const ALL_RIGHTS = { canOverridePrice: true, canSellBelowCost: true, canOverrideCredit: true };

const orderLine: InvoiceableLine = {
  salesOrderLineId: 'ol1',
  productId: 'p1',
  sku: 'SKU-1',
  productName: 'Kajaria IVR',
  sizeMm: '600x600',
  piecesPerBox: 4,
  baseUom: 'BOX',
  hsnCode: '69072100',
  orderedQtyBoxes: 10,
  invoicedQtyBoxes: 0,
  draftedQtyBoxes: 0,
  pendingQtyBoxes: 10,
  rate: 1250,
  discountPct: 0,
  gstRate: 18,
  mrp: 1600,
  sources: [
    {
      branchId: 'b1',
      branchName: 'Head office',
      godownId: 'g1',
      godownName: 'Main godown',
      batchNo: 'B-1',
      shade: null,
      qtyBoxes: 10,
    },
  ],
};

const parties = {
  customerName: 'Dinesh Traders',
  customerAddress: 'Dindigul',
  customerMobile: '9894477819',
  customerGstin: '33BXOPP2229N1ZZ',
  customerStateCode: '33',
  customerIsActive: true,
  creditLimit: 0,
  creditDays: 30,
  outstanding: 0,
  branchStateCode: '33',
};

const mockRepo = (): jest.Mocked<SalesInvoiceRepository> => ({
  priceHints: jest.fn().mockResolvedValue(new Map()),
  nextInvoiceNumber: jest.fn().mockResolvedValue('INV-2026-00001'),
  list: jest.fn(),
  findById: jest.fn(),
  create: jest.fn().mockResolvedValue({ id: 'i1' } as SalesInvoiceItem),
  update: jest.fn(),
  post: jest.fn().mockResolvedValue({ id: 'i1' } as SalesInvoiceItem),
  cancel: jest.fn(),
  softDelete: jest.fn(),
  printData: jest.fn(),
  billingParties: jest.fn().mockResolvedValue(parties),
  salesmanName: jest.fn().mockResolvedValue('Arun Kumar'),
  invoiceableLines: jest.fn().mockResolvedValue([orderLine]),
  assertGodownsInBranch: jest.fn().mockResolvedValue(undefined),
});

const base = {
  customerId: 'c1',
  branchId: 'b1',
  salesOrderId: 'o1',
};

const line = (overrides: Record<string, unknown> = {}) => ({
  productId: 'p1',
  salesOrderLineId: 'ol1',
  godownId: 'g1',
  batchNo: 'B-1',
  rate: 1250,
  qtyBoxes: 10,
  ...overrides,
});

describe('CreateSalesInvoiceHandler', () => {
  it('halves the tax into CGST and SGST for a customer in the same state', async () => {
    const repo = mockRepo();
    const handler = new CreateSalesInvoiceHandler(repo);
    await handler.execute(new CreateSalesInvoiceCommand({ ...base, lines: [line()] }, 'actor-1', ALL_RIGHTS));

    const [, data] = repo.create.mock.calls[0]!;
    expect(data.subTotal).toBe(12500);
    expect(data.cgstAmount).toBe(1125);
    expect(data.sgstAmount).toBe(1125);
    expect(data.igstAmount).toBe(0);
    expect(data.grandTotal).toBe(14750);
  });

  it('charges IGST when the customer is in another state', async () => {
    const repo = mockRepo();
    repo.billingParties.mockResolvedValue({ ...parties, customerStateCode: '29' });
    const handler = new CreateSalesInvoiceHandler(repo);
    await handler.execute(new CreateSalesInvoiceCommand({ ...base, lines: [line()] }, 'actor-1', ALL_RIGHTS));

    const [, data] = repo.create.mock.calls[0]!;
    expect(data.igstAmount).toBe(2250);
    expect(data.cgstAmount).toBe(0);
    expect(data.sgstAmount).toBe(0);
    expect(data.grandTotal).toBe(14750);
  });

  it('falls back to the rate agreed on the order', async () => {
    const repo = mockRepo();
    const handler = new CreateSalesInvoiceHandler(repo);
    await handler.execute(
      new CreateSalesInvoiceCommand({ ...base, lines: [line({ rate: 0 })] }, 'actor-1', ALL_RIGHTS),
    );

    const [, data] = repo.create.mock.calls[0]!;
    expect(data.lines[0]).toMatchObject({ rate: 1250, gstRate: 18, hsnCode: '69072100' });
  });

  it('refuses to invoice more than the order still owes', async () => {
    const repo = mockRepo();
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand({ ...base, lines: [line({ qtyBoxes: 11 })] }, 'actor-1', ALL_RIGHTS),
      ),
    ).rejects.toThrow(/only 10 box left to invoice/);
  });

  it('will not let a second draft claim what an unposted draft already holds', async () => {
    const repo = mockRepo();
    // 10 ordered, 6 already sitting on a draft that has not posted.
    repo.invoiceableLines.mockResolvedValue([
      { ...orderLine, draftedQtyBoxes: 6, pendingQtyBoxes: 4 },
    ]);
    const handler = new CreateSalesInvoiceHandler(repo);

    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand({ ...base, lines: [line({ qtyBoxes: 10 })] }, 'actor-1', ALL_RIGHTS),
      ),
    ).rejects.toThrow(/already on an unposted draft/);
  });

  it('still allows what is left once a draft has taken its share', async () => {
    const repo = mockRepo();
    repo.invoiceableLines.mockResolvedValue([
      { ...orderLine, draftedQtyBoxes: 6, pendingQtyBoxes: 4 },
    ]);
    const handler = new CreateSalesInvoiceHandler(repo);

    await handler.execute(
      new CreateSalesInvoiceCommand({ ...base, lines: [line({ qtyBoxes: 4 })] }, 'actor-1', ALL_RIGHTS),
    );
    expect(repo.create).toHaveBeenCalled();
  });

  it('counts every line of the invoice against the same order line', async () => {
    const repo = mockRepo();
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand(
          { ...base, lines: [line({ qtyBoxes: 6 }), line({ qtyBoxes: 6, godownId: 'g2' })] },
          'actor-1',
          ALL_RIGHTS,
        ),
      ),
    ).rejects.toThrow(/only 10 box left to invoice/);
  });

  it('allows a partial invoice against the order', async () => {
    const repo = mockRepo();
    const handler = new CreateSalesInvoiceHandler(repo);
    await handler.execute(
      new CreateSalesInvoiceCommand({ ...base, lines: [line({ qtyBoxes: 4 })] }, 'actor-1', ALL_RIGHTS),
    );

    const [, data] = repo.create.mock.calls[0]!;
    expect(data.lines[0]!.qtyBoxes).toBe(4);
    expect(data.grandTotal).toBe(5900);
  });

  it('sets the due date from the credit days when none is given', async () => {
    const repo = mockRepo();
    const handler = new CreateSalesInvoiceHandler(repo);
    await handler.execute(
      new CreateSalesInvoiceCommand(
        { ...base, invoiceDate: '2026-08-01T00:00:00.000Z', lines: [line()] },
        'actor-1',
        ALL_RIGHTS,
      ),
    );

    const [, data] = repo.create.mock.calls[0]!;
    expect(data.dueDate?.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('refuses an inactive customer', async () => {
    const repo = mockRepo();
    repo.billingParties.mockResolvedValue({ ...parties, customerIsActive: false });
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(new CreateSalesInvoiceCommand({ ...base, lines: [line()] }, 'actor-1', ALL_RIGHTS)),
    ).rejects.toThrow(/inactive/);
  });
});

describe('PostSalesInvoiceHandler', () => {
  const draft = {
    id: 'i1',
    status: 'DRAFT',
    customerId: 'c1',
    branchId: 'b1',
    grandTotal: 14750,
  } as unknown as SalesInvoiceItem;

  it('posts a draft within the credit limit', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(draft);
    const handler = new PostSalesInvoiceHandler(repo);

    await handler.execute(new PostSalesInvoiceCommand('i1', 1, 'actor-1', false));
    expect(repo.post).toHaveBeenCalledWith('i1', 1, 'actor-1');
  });

  it('stops when the outstanding plus this invoice breaches the limit', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(draft);
    repo.billingParties.mockResolvedValue({ ...parties, creditLimit: 20000, outstanding: 8000 });
    const handler = new PostSalesInvoiceHandler(repo);

    await expect(
      handler.execute(new PostSalesInvoiceCommand('i1', 1, 'actor-1', false)),
    ).rejects.toThrow(/Credit limit exceeded/);
    expect(repo.post).not.toHaveBeenCalled();
  });

  it('lets an approver post past the limit', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(draft);
    repo.billingParties.mockResolvedValue({ ...parties, creditLimit: 20000, outstanding: 8000 });
    const handler = new PostSalesInvoiceHandler(repo);

    await handler.execute(new PostSalesInvoiceCommand('i1', 1, 'approver', true));
    expect(repo.post).toHaveBeenCalled();
  });

  it('refuses to post twice', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue({ ...draft, status: 'POSTED' } as SalesInvoiceItem);
    const handler = new PostSalesInvoiceHandler(repo);

    await expect(
      handler.execute(new PostSalesInvoiceCommand('i1', 1, 'actor-1', false)),
    ).rejects.toThrow(/Only draft invoices can be posted/);
  });
});

/**
 * Invoices enforced no price rule at all until the guard was shared across the three
 * documents. An invoice can be raised without an order — a counter sale — which made it
 * the obvious way past a floor that quotations and orders both applied, and the counter is
 * where discounts actually get given.
 */
describe('CreateSalesInvoiceHandler — the price floor', () => {
  const NO_RIGHTS = { canOverridePrice: false, canSellBelowCost: false, canOverrideCredit: true };

  /** A counter sale: no order behind it, which is the path that had no guard. */
  const counterLine = (overrides: Record<string, unknown> = {}) => ({
    ...line(overrides),
    salesOrderLineId: undefined,
  });

  const withHints = (landingCost: number | null, minSellingPrice: number | null) => {
    const repo = mockRepo();
    repo.priceHints.mockResolvedValue(
      new Map([['p1', { sku: 'KAJ-600', landingCost, minSellingPrice } as never]]),
    );
    return repo;
  };

  it('refuses a counter sale below the branch minimum', async () => {
    const repo = withHints(800, 1150);
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand(
          { ...base, salesOrderId: undefined, lines: [counterLine({ rate: 1000 })] },
          'actor-1',
          NO_RIGHTS,
        ),
      ),
    ).rejects.toThrow(/below the branch minimum/);
  });

  it('refuses a sale below cost even when the branch minimum allows it', async () => {
    // The case the two rules are kept apart for: somebody set the minimum under cost, so
    // the floor passes and the sale still loses money.
    const repo = withHints(1200, 900);
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand(
          { ...base, salesOrderId: undefined, lines: [counterLine({ rate: 1000 })] },
          'actor-1',
          NO_RIGHTS,
        ),
      ),
    ).rejects.toThrow(/loses/);
  });

  it('lets a price above both through', async () => {
    const repo = withHints(800, 1150);
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand(
          { ...base, salesOrderId: undefined, lines: [counterLine({ rate: 1250 })] },
          'actor-1',
          NO_RIGHTS,
        ),
      ),
    ).resolves.toBeDefined();
  });

  it('applies the floor to the discounted rate, not the list price', async () => {
    // A discount comes out of margin and nowhere else, so 1,250 less 30% is the number
    // the floor has to see.
    const repo = withHints(800, 1150);
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand(
          { ...base, salesOrderId: undefined, lines: [counterLine({ rate: 1250, discountPct: 30 })] },
          'actor-1',
          NO_RIGHTS,
        ),
      ),
    ).rejects.toThrow(/below the branch minimum/);
  });

  it('says nothing about a product with no cost and no floor recorded', async () => {
    const repo = withHints(null, null);
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand(
          { ...base, salesOrderId: undefined, lines: [counterLine({ rate: 1 })] },
          'actor-1',
          NO_RIGHTS,
        ),
      ),
    ).resolves.toBeDefined();
  });
});

/**
 * Credit used to be checked only at posting, so an invoice for a customer already past
 * their limit saved happily and failed later — after the goods were picked and a number
 * had been said out loud. It is now checked as the invoice is written, and again at
 * posting because the outstanding moves in between.
 */
describe('CreateSalesInvoiceHandler — the credit limit', () => {
  const NO_OVERRIDE = {
    canOverridePrice: true,
    canSellBelowCost: true,
    canOverrideCredit: false,
  };

  const owing = (creditLimit: number, outstanding: number) => {
    const repo = mockRepo();
    repo.billingParties.mockResolvedValue({
      customerName: 'KARTHIK',
      customerIsActive: true,
      branchStateCode: '33',
      customerStateCode: '33',
      creditLimit,
      creditDays: 0,
      outstanding,
    } as never);
    return repo;
  };

  it('refuses an invoice for a customer already past their limit', async () => {
    const repo = owing(2_500, 40_000);
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand(
          { ...base, lines: [line()] },
          'actor-1',
          NO_OVERRIDE,
        ),
      ),
    ).rejects.toThrow(/over their credit limit/);
  });

  it('refuses one that would cross the limit for the first time', async () => {
    const repo = owing(2_500, 1_000);
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand(
          { ...base, lines: [line()] },
          'actor-1',
          NO_OVERRIDE,
        ),
      ),
    ).rejects.toThrow(/over their credit limit/);
  });

  it('lets an approver through', async () => {
    const repo = owing(2_500, 40_000);
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand(
          { ...base, lines: [line()] },
          'actor-1',
          { ...NO_OVERRIDE, canOverrideCredit: true },
        ),
      ),
    ).resolves.toBeDefined();
  });

  it('treats a limit of zero as no limit rather than a limit of nothing', async () => {
    const repo = owing(0, 500_000);
    const handler = new CreateSalesInvoiceHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesInvoiceCommand(
          { ...base, lines: [line()] },
          'actor-1',
          NO_OVERRIDE,
        ),
      ),
    ).resolves.toBeDefined();
  });
});
