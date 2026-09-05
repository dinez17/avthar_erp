import type { CustomerReceiptItem, OpenInvoiceItem } from '@tiles-erp/shared-types';
import {
  allocateOldestFirst,
  CreateReceiptCommand,
  CreateReceiptHandler,
} from './receipt.handlers';
import type { ReceiptRepository } from '../domain/receipt.repository';

const invoice = (
  id: string,
  balanceAmount: number,
  invoiceDate = '2026-08-01T00:00:00.000Z',
): OpenInvoiceItem => ({
  salesInvoiceId: id,
  invoiceNumber: `INV-${id}`,
  invoiceDate,
  dueDate: null,
  grandTotal: balanceAmount,
  paidAmount: 0,
  balanceAmount,
  overdueDays: 0,
});

const mockRepo = (): jest.Mocked<ReceiptRepository> => ({
  nextReceiptNumber: jest.fn().mockResolvedValue('RCPT-2026-00001'),
  list: jest.fn(),
  findById: jest.fn(),
  create: jest.fn().mockResolvedValue({ id: 'r1' } as CustomerReceiptItem),
  update: jest.fn(),
  post: jest.fn(),
  cancel: jest.fn(),
  softDelete: jest.fn(),
  openInvoices: jest.fn().mockResolvedValue([invoice('i1', 5000), invoice('i2', 3000)]),
  dueSummary: jest.fn(),
  printData: jest.fn(),
  assertCustomer: jest.fn().mockResolvedValue(undefined),
  ledger: jest.fn(),
  outstanding: jest.fn(),
});

const base = { customerId: 'c1', branchId: 'b1' };

/** A single cash tender, the common case. */
const cash = (amount: number) => [{ mode: 'CASH' as const, amount }];

describe('allocateOldestFirst', () => {
  it('clears the oldest invoice before touching the next', () => {
    expect(allocateOldestFirst(6000, [invoice('i1', 5000), invoice('i2', 3000)])).toEqual([
      { salesInvoiceId: 'i1', amount: 5000 },
      { salesInvoiceId: 'i2', amount: 1000 },
    ]);
  });

  it('part-settles a single invoice when the money runs out', () => {
    expect(allocateOldestFirst(2000, [invoice('i1', 5000)])).toEqual([
      { salesInvoiceId: 'i1', amount: 2000 },
    ]);
  });

  it('leaves the surplus unallocated when everything is already clear', () => {
    expect(allocateOldestFirst(10000, [invoice('i1', 5000), invoice('i2', 3000)])).toEqual([
      { salesInvoiceId: 'i1', amount: 5000 },
      { salesInvoiceId: 'i2', amount: 3000 },
    ]);
  });

  it('allocates nothing when there is no open invoice', () => {
    expect(allocateOldestFirst(5000, [])).toEqual([]);
  });
});

describe('CreateReceiptHandler', () => {
  it('settles the oldest invoices when no allocation is given', async () => {
    const repo = mockRepo();
    const handler = new CreateReceiptHandler(repo);
    await handler.execute(new CreateReceiptCommand({ ...base, payments: cash(6000) }, 'actor-1'));

    const [, data] = repo.create.mock.calls[0]!;
    expect(data.allocations).toEqual([
      { salesInvoiceId: 'i1', amount: 5000 },
      { salesInvoiceId: 'i2', amount: 1000 },
    ]);
    expect(data.allocatedAmount).toBe(6000);
  });

  it('keeps the surplus on account as an advance', async () => {
    const repo = mockRepo();
    const handler = new CreateReceiptHandler(repo);
    await handler.execute(new CreateReceiptCommand({ ...base, payments: cash(10000) }, 'actor-1'));

    const [, data] = repo.create.mock.calls[0]!;
    expect(data.amount).toBe(10000);
    expect(data.allocatedAmount).toBe(8000);
  });

  it('honours a hand-picked allocation', async () => {
    const repo = mockRepo();
    const handler = new CreateReceiptHandler(repo);
    await handler.execute(
      new CreateReceiptCommand(
        { ...base, payments: cash(3000), allocations: [{ salesInvoiceId: 'i2', amount: 3000 }] },
        'actor-1',
      ),
    );

    const [, data] = repo.create.mock.calls[0]!;
    expect(data.allocations).toEqual([{ salesInvoiceId: 'i2', amount: 3000 }]);
  });

  it('refuses to settle more than an invoice owes', async () => {
    const repo = mockRepo();
    const handler = new CreateReceiptHandler(repo);
    await expect(
      handler.execute(
        new CreateReceiptCommand(
          { ...base, payments: cash(9000), allocations: [{ salesInvoiceId: 'i2', amount: 9000 }] },
          'actor-1',
        ),
      ),
    ).rejects.toThrow(/only has 3000 outstanding/);
  });

  it('refuses allocations adding up to more than was received', async () => {
    const repo = mockRepo();
    const handler = new CreateReceiptHandler(repo);
    await expect(
      handler.execute(
        new CreateReceiptCommand(
          { ...base, payments: cash(4000), allocations: [
              { salesInvoiceId: 'i1', amount: 3000 },
              { salesInvoiceId: 'i2', amount: 3000 },
            ],
          },
          'actor-1',
        ),
      ),
    ).rejects.toThrow(/more than the amount received/);
  });

  it('refuses an invoice that belongs to someone else', async () => {
    const repo = mockRepo();
    const handler = new CreateReceiptHandler(repo);
    await expect(
      handler.execute(
        new CreateReceiptCommand(
          { ...base, payments: cash(1000), allocations: [{ salesInvoiceId: 'other', amount: 1000 }] },
          'actor-1',
        ),
      ),
    ).rejects.toThrow(/not open for this customer/);
  });

  it('refuses a zero amount', async () => {
    const repo = mockRepo();
    const handler = new CreateReceiptHandler(repo);
    await expect(
      handler.execute(new CreateReceiptCommand({ ...base, payments: [] }, 'actor-1')),
    ).rejects.toThrow(/amount received/);
  });
});

describe('mixed tenders', () => {
  it('totals the payment lines and marks the receipt MIXED', async () => {
    const repo = mockRepo();
    const handler = new CreateReceiptHandler(repo);
    await handler.execute(
      new CreateReceiptCommand(
        {
          ...base,
          payments: [
            { mode: 'CASH', amount: 1000 },
            { mode: 'UPI', amount: 5000, referenceNo: 'UPI-9931' },
          ],
        },
        'actor-1',
      ),
    );

    const [, data] = repo.create.mock.calls[0]!;
    expect(data.amount).toBe(6000);
    expect(data.mode).toBe('MIXED');
    expect(data.payments).toEqual([
      { mode: 'CASH', amount: 1000, referenceNo: null, accountId: null, bankName: null },
      { mode: 'UPI', amount: 5000, referenceNo: 'UPI-9931', accountId: null, bankName: null },
    ]);
    // The whole 6,000 still lands on the oldest invoices.
    expect(data.allocatedAmount).toBe(6000);
  });

  it('carries the account each tender names through to the write', async () => {
    const repo = mockRepo();
    const handler = new CreateReceiptHandler(repo);
    await handler.execute(
      new CreateReceiptCommand(
        {
          ...base,
          payments: [
            { mode: 'CASH', amount: 1000, accountId: 'drawer-1' },
            { mode: 'UPI', amount: 5000, accountId: 'axis-1' },
          ],
        },
        'actor-1',
      ),
    );

    // Posting reads these to decide which book each amount goes into, so losing them
    // here would silently keep the money out of the cash book.
    const [, data] = repo.create.mock.calls[0]!;
    expect(data.payments.map((payment) => payment.accountId)).toEqual(['drawer-1', 'axis-1']);
  });

  it('keeps a single tender as its own mode', async () => {
    const repo = mockRepo();
    const handler = new CreateReceiptHandler(repo);
    await handler.execute(
      new CreateReceiptCommand({ ...base, payments: [{ mode: 'UPI', amount: 2000 }] }, 'actor-1'),
    );

    const [, data] = repo.create.mock.calls[0]!;
    expect(data.mode).toBe('UPI');
  });
});
