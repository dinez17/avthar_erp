import { ForbiddenError, ValidationError } from '@tiles-erp/shared';
import {
  ChangeQuotationStatusCommand,
  ChangeQuotationStatusHandler,
  CreateQuotationCommand,
  CreateQuotationHandler,
  ListQuotationsHandler,
  ListQuotationsQuery,
  UpdateQuotationCommand,
  UpdateQuotationHandler,
} from './quotation.handlers';
import type { QuotationRepository } from '../domain/quotation.repository';
import type { ProductPriceHint, QuotationItem } from '@tiles-erp/shared-types';


/** A user who may break either rule, and one who may break neither. */
const ALL_RIGHTS = { canOverridePrice: true, canSellBelowCost: true, canOverrideCredit: true };
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

const mockRepo = (): jest.Mocked<QuotationRepository> => ({
  nextQuotationNumber: jest.fn().mockResolvedValue('QT-2026-00001'),
  list: jest.fn(),
  findById: jest.fn(),
  create: jest.fn().mockResolvedValue({ id: 'q1' } as QuotationItem),
  update: jest.fn(),
  setStatus: jest.fn().mockResolvedValue({ id: 'q1' } as QuotationItem),
  assertReferences: jest.fn().mockResolvedValue(undefined),
  salesmanName: jest.fn().mockResolvedValue('Arun Kumar'),
  isSalesman: jest.fn().mockResolvedValue(false),
  printData: jest.fn(),
  availableStock: jest.fn().mockResolvedValue([]),
  customerSnapshot: jest
    .fn()
    .mockResolvedValue({ name: 'Walk-in', address: null, mobile: null }),
  customerByPhone: jest.fn().mockResolvedValue(null),
  registerWalkIn: jest
    .fn()
    .mockResolvedValue({ customerId: 'c-new', customerCode: 'CUST-000042', created: true }),
  priceHints: jest.fn().mockResolvedValue(new Map([['p1', hint]])),
});

const base = { customerId: 'c1', branchId: 'b1', customerMobile: '9894477819' };

describe('ListQuotationsHandler', () => {
  it('restricts a sales-role user to their own quotations', async () => {
    const repo = mockRepo();
    repo.isSalesman.mockResolvedValue(true);
    repo.list.mockResolvedValue({
      items: [],
      meta: {
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });

    await new ListQuotationsHandler(repo).execute(
      new ListQuotationsQuery(
        { page: 1, pageSize: 25 },
        { branchIds: ['branch-1'], salesmanUserId: 'another-salesman' },
        'logged-in-salesman',
      ),
    );

    expect(repo.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 25 },
      { branchIds: ['branch-1'], salesmanUserId: 'logged-in-salesman' },
    );
  });
});

describe('CreateQuotationHandler', () => {
  it('requires a mobile number', async () => {
    const repo = mockRepo();
    await expect(new CreateQuotationHandler(repo).execute(
      new CreateQuotationCommand({ ...base, customerId: undefined, customerMobile: undefined, lines: [] }, 'a', NO_RIGHTS),
    )).rejects.toThrow('mobile number is required');
  });

  it('uses the saved customer name when the mobile already exists', async () => {
    const repo = mockRepo();
    repo.customerByPhone.mockResolvedValue({ id: 'dinesh-id', name: 'DINESHBABU VENUGOPAL', mobile: '9894477819' });
    const handler = new CreateQuotationHandler(repo);
    await handler.execute(new CreateQuotationCommand({
      ...base, customerId: undefined, customerName: 'ganesh',
      lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1250 }],
    }, 'a', NO_RIGHTS));
    const [, data] = repo.create.mock.calls[0]!;
    expect(data).toMatchObject({ customerId: 'dinesh-id', customerName: 'DINESHBABU VENUGOPAL' });
  });

  it('reverses GST from the full inclusive line amount', async () => {
    const repo = mockRepo();
    const handler = new CreateQuotationHandler(repo);
    await handler.execute(
      new CreateQuotationCommand(
        { ...base, lines: [{ productId: 'p1', qtyBoxes: 10, rate: 420 / 1.18 }] },
        'a',
        ALL_RIGHTS,
      ),
    );
    const [, data] = repo.create.mock.calls[0]!;
    expect(data.lines[0]).toMatchObject({ lineSubTotal: 3559.32, lineGst: 640.68, lineTotal: 4200 });
    expect(data.grandTotal).toBe(4200);
  });

  it("falls back to the branch selling price when no rate is given", async () => {
    const repo = mockRepo();
    const handler = new CreateQuotationHandler(repo);
    await handler.execute(
      new CreateQuotationCommand({ ...base, lines: [{ productId: 'p1', qtyBoxes: 10, rate: 0 }] }, 'a', NO_RIGHTS),
    );
    const [, data] = repo.create.mock.calls[0]!;
    expect(data.lines[0]).toMatchObject({ rate: 1250, gstRate: 18, mrp: 1600 });
    expect(data.grandTotal).toBe(14750);
  });

  it('converts box plus loose pieces into a box quantity', async () => {
    const repo = mockRepo();
    const handler = new CreateQuotationHandler(repo);
    // 4 pieces per box, so 10 boxes + 2 pieces = 10.5 boxes
    await handler.execute(
      new CreateQuotationCommand(
        { ...base, lines: [{ productId: 'p1', boxes: 10, pieces: 2, rate: 1250 }] },
        'a',
        NO_RIGHTS,
      ),
    );
    const [, data] = repo.create.mock.calls[0]!;
    expect(data.lines[0]).toMatchObject({ boxes: 10, pieces: 2, qtyBoxes: 10.5 });
  });

  it('credits the acting user when that user is a salesperson', async () => {
    const repo = mockRepo();
    repo.isSalesman.mockResolvedValue(true);
    const handler = new CreateQuotationHandler(repo);
    await handler.execute(
      new CreateQuotationCommand(
        { ...base, salesmanUserId: 'someone-else', lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1250 }] },
        'actor-1',
        NO_RIGHTS,
      ),
    );
    const [, data] = repo.create.mock.calls[0]!;
    expect(data.salesmanUserId).toBe('actor-1');
    expect(data.salesmanName).toBe('Arun Kumar');
  });

  it('keeps the chosen salesperson for back-office users', async () => {
    const repo = mockRepo();
    const handler = new CreateQuotationHandler(repo);
    await handler.execute(
      new CreateQuotationCommand(
        { ...base, salesmanUserId: 'sales-9', lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1250 }] },
        'actor-1',
        NO_RIGHTS,
      ),
    );
    const [, data] = repo.create.mock.calls[0]!;
    expect(data.salesmanUserId).toBe('sales-9');
  });

  it('adds freight, loading and round off outside the taxable value', async () => {
    const repo = mockRepo();
    const handler = new CreateQuotationHandler(repo);
    await handler.execute(
      new CreateQuotationCommand(
        {
          ...base,
          freightCharge: 500,
          unloadingCharge: 200,
          loadingCharge: 100,
          roundOff: -0.5,
          lines: [{ productId: 'p1', qtyBoxes: 10, rate: 1250 }],
        },
        'a',
        NO_RIGHTS,
      ),
    );
    const [, data] = repo.create.mock.calls[0]!;
    // 12,500 + 18% GST = 14,750, plus 800 charges, less 0.50 rounding
    expect(data.subTotal).toBe(12500);
    expect(data.grandTotal).toBe(15549.5);
  });

  it('accepts a walk-in customer with no master record', async () => {
    const repo = mockRepo();
    const handler = new CreateQuotationHandler(repo);
    await handler.execute(
      new CreateQuotationCommand(
        {
          branchId: 'b1',
          customerName: '  Ramesh  ',
          customerMobile: '9876543210',
          lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1250 }],
        },
        'a',
        NO_RIGHTS,
      ),
    );
    const [, data] = repo.create.mock.calls[0]!;
    expect(data).toMatchObject({ customerId: null, customerName: 'Ramesh' });
  });

  it('requires a customer name when there is no linked customer', async () => {
    const handler = new CreateQuotationHandler(mockRepo());
    await expect(
      handler.execute(
        new CreateQuotationCommand(
          { branchId: 'b1', lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1250 }] },
          'a',
          NO_RIGHTS,
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('blocks a net rate below the branch minimum without the override permission', async () => {
    const repo = mockRepo();
    const handler = new CreateQuotationHandler(repo);
    await expect(
      handler.execute(
        new CreateQuotationCommand(
          { ...base, lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1100 }] },
          'a',
          NO_RIGHTS,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('allows below-minimum pricing when the actor may override', async () => {
    const repo = mockRepo();
    const handler = new CreateQuotationHandler(repo);
    await handler.execute(
      new CreateQuotationCommand(
        { ...base, lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1100 }] },
        'a', ALL_RIGHTS)
    );
    expect(repo.create).toHaveBeenCalled();
  });

  it('applies the floor to the discounted rate, not the list rate', async () => {
    const repo = mockRepo();
    const handler = new CreateQuotationHandler(repo);
    // 1250 less 10% = 1125, below the 1150 minimum
    await expect(
      handler.execute(
        new CreateQuotationCommand(
          { ...base, lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1250, discountPct: 10 }] },
          'a',
          NO_RIGHTS,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects duplicate products', async () => {
    const handler = new CreateQuotationHandler(mockRepo());
    const line = { productId: 'p1', qtyBoxes: 1, rate: 1250 };
    await expect(
      handler.execute(new CreateQuotationCommand({ ...base, lines: [line, line] }, 'a', NO_RIGHTS)),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('UpdateQuotationHandler', () => {
  const existing = {
    id: 'q1',
    customerId: 'c1',
    customerName: 'Customer',
    branchId: 'b1',
    status: 'SENT',
    freightCharge: 0,
    unloadingCharge: 0,
    loadingCharge: 0,
    roundOff: 0,
  } as QuotationItem;

  it('allows changes after sending but before customer acceptance', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(existing);
    repo.update.mockResolvedValue(existing);
    await new UpdateQuotationHandler(repo).execute(new UpdateQuotationCommand(
      'q1',
      { version: 2, lines: [{ productId: 'p1', qtyBoxes: 2, rate: 1250 }] },
      'a',
      NO_RIGHTS,
    ));
    expect(repo.update).toHaveBeenCalledWith('q1', 2, expect.objectContaining({ branchId: 'b1' }), 'a');
  });

  it('blocks changes once the customer accepts', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue({ ...existing, status: 'ACCEPTED' });
    await expect(new UpdateQuotationHandler(repo).execute(new UpdateQuotationCommand(
      'q1', { version: 3 }, 'a', NO_RIGHTS,
    ))).rejects.toBeInstanceOf(ValidationError);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('ChangeQuotationStatusHandler', () => {
  it('sends a draft', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue({ id: 'q1', status: 'DRAFT' } as QuotationItem);
    const handler = new ChangeQuotationStatusHandler(repo);
    await handler.execute(new ChangeQuotationStatusCommand('q1', 1, 'SENT', 'a'));
    expect(repo.setStatus).toHaveBeenCalledWith('q1', 1, 'SENT', 'a');
  });

  it('refuses to accept a quotation that was never sent', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue({ id: 'q1', status: 'DRAFT' } as QuotationItem);
    const handler = new ChangeQuotationStatusHandler(repo);
    await expect(
      handler.execute(new ChangeQuotationStatusCommand('q1', 1, 'ACCEPTED', 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses to accept an expired quotation', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue({
      id: 'q1',
      status: 'SENT',
      isExpired: true,
    } as QuotationItem);
    const handler = new ChangeQuotationStatusHandler(repo);
    await expect(
      handler.execute(new ChangeQuotationStatusCommand('q1', 1, 'ACCEPTED', 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('accepting a walk-in quotation', () => {
  const walkIn = {
    id: 'q1',
    status: 'SENT' as const,
    isExpired: false,
    customerId: null,
    customerName: 'Ramesh',
    customerMobile: '+91 98765 43210',
    customerAddress: '4 Bazaar Street',
  };

  const accept = (repo: jest.Mocked<QuotationRepository>) =>
    new ChangeQuotationStatusHandler(repo).execute(
      new ChangeQuotationStatusCommand('q1', 1, 'ACCEPTED', 'u1'),
    );

  it('creates the customer master record from the quotation', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(walkIn as unknown as QuotationItem);

    await accept(repo);

    expect(repo.registerWalkIn).toHaveBeenCalledWith(
      'q1',
      // The number is normalised before it reaches the repository, so the same person
      // quoted twice matches rather than being created twice.
      { name: 'Ramesh', phone: '9876543210', address: '4 Bazaar Street' },
      'u1',
    );
    expect(repo.setStatus).toHaveBeenCalled();
  });

  it('leaves a quotation that already has a customer alone', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue({ ...walkIn, customerId: 'c1' } as unknown as QuotationItem);

    await accept(repo);

    expect(repo.registerWalkIn).not.toHaveBeenCalled();
    expect(repo.setStatus).toHaveBeenCalled();
  });

  it('refuses to accept a walk-in with no phone, and does not move the status', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue({
      ...walkIn,
      customerMobile: null,
    } as unknown as QuotationItem);

    await expect(accept(repo)).rejects.toThrow(/mobile number/);
    expect(repo.setStatus).not.toHaveBeenCalled();
  });

  it('does not register anybody when the quotation is merely being sent', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue({
      ...walkIn,
      status: 'DRAFT',
    } as unknown as QuotationItem);

    await new ChangeQuotationStatusHandler(repo).execute(
      new ChangeQuotationStatusCommand('q1', 1, 'SENT', 'u1'),
    );

    expect(repo.registerWalkIn).not.toHaveBeenCalled();
  });

  it('does not register anybody when the quotation is rejected', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(walkIn as unknown as QuotationItem);

    await new ChangeQuotationStatusHandler(repo).execute(
      new ChangeQuotationStatusCommand('q1', 1, 'REJECTED', 'u1'),
    );

    expect(repo.registerWalkIn).not.toHaveBeenCalled();
  });
});
