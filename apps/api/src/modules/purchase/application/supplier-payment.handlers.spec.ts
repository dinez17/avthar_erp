import { ValidationError } from '@tiles-erp/shared';
import type { OpenBillItem, OpenDebitNoteItem, SupplierPaymentItem } from '@tiles-erp/shared-types';
import {
  allocateByDueDate,
  CreateSupplierPaymentCommand,
  CreateSupplierPaymentHandler,
  UpdateSupplierPaymentCommand,
  UpdateSupplierPaymentHandler,
} from './supplier-payment.handlers';
import type { SupplierPaymentRepository } from '../domain/supplier-payment.repository';

/** Two bills, the second falling due first — order matters for automatic allocation. */
const bills: OpenBillItem[] = [
  {
    purchaseInvoiceId: 'i1',
    invoiceNumber: 'PINV-1',
    supplierInvoiceNo: 'KAJ/883',
    invoiceDate: '2026-06-01T00:00:00.000Z',
    dueDate: '2026-07-01T00:00:00.000Z',
    grandTotal: 30000,
    paidAmount: 0,
    balanceAmount: 30000,
    overdueDays: 41,
  },
  {
    purchaseInvoiceId: 'i2',
    invoiceNumber: 'PINV-2',
    supplierInvoiceNo: 'KAJ/902',
    invoiceDate: '2026-07-01T00:00:00.000Z',
    dueDate: '2026-08-01T00:00:00.000Z',
    grandTotal: 20000,
    paidAmount: 0,
    balanceAmount: 20000,
    overdueDays: 10,
  },
];

const debitNotes: OpenDebitNoteItem[] = [
  {
    purchaseReturnId: 'r1',
    returnNumber: 'PRET-1',
    returnDate: '2026-07-15T00:00:00.000Z',
    grandTotal: 5000,
    adjustedAmount: 0,
    balanceAmount: 5000,
  },
];

const repo = (): jest.Mocked<SupplierPaymentRepository> => ({
  nextPaymentNumber: jest.fn().mockResolvedValue('PAY-2026-00001'),
  list: jest.fn(),
  findById: jest.fn(),
  create: jest.fn().mockResolvedValue({ id: 'p1' } as SupplierPaymentItem),
  update: jest.fn().mockResolvedValue({ id: 'p1' } as SupplierPaymentItem),
  post: jest.fn(),
  cancel: jest.fn(),
  softDelete: jest.fn(),
  openBills: jest.fn().mockResolvedValue(bills),
  openDebitNotes: jest.fn().mockResolvedValue(debitNotes),
  dueSummary: jest.fn(),
  assertSupplier: jest.fn().mockResolvedValue(undefined),
  ledger: jest.fn(),
  payables: jest.fn(),
});

const base = { supplierId: 's1', branchId: 'b1' };
const cash = (amount: number) => [{ mode: 'CASH' as const, amount }];

describe('allocateByDueDate', () => {
  it('clears the bill due soonest first', () => {
    expect(allocateByDueDate(35000, bills)).toEqual([
      { purchaseInvoiceId: 'i1', amount: 30000 },
      { purchaseInvoiceId: 'i2', amount: 5000 },
    ]);
  });

  it('leaves the surplus unallocated rather than overpaying a bill', () => {
    const allocated = allocateByDueDate(60000, bills);
    expect(allocated.reduce((sum, a) => sum + a.amount, 0)).toBe(50000);
  });
});

describe('CreateSupplierPaymentHandler', () => {
  it('totals the tenders rather than trusting a typed amount', async () => {
    const payments = repo();
    const handler = new CreateSupplierPaymentHandler(payments);

    await handler.execute(
      new CreateSupplierPaymentCommand(
        {
          ...base,
          tenders: [
            { mode: 'BANK', amount: 40000 },
            { mode: 'CASH', amount: 5000 },
          ],
        },
        'actor',
      ),
    );

    const [, data] = payments.create.mock.calls[0]!;
    expect(data.amount).toBe(45000);
    expect(data.mode).toBe('MIXED');
  });

  it('keeps the single tender as the mode', async () => {
    const payments = repo();
    const handler = new CreateSupplierPaymentHandler(payments);
    await handler.execute(
      new CreateSupplierPaymentCommand({ ...base, tenders: cash(1000) }, 'actor'),
    );
    expect(payments.create.mock.calls[0]![1].mode).toBe('CASH');
  });

  it('allocates automatically to the bill due soonest', async () => {
    const payments = repo();
    const handler = new CreateSupplierPaymentHandler(payments);

    await handler.execute(
      new CreateSupplierPaymentCommand({ ...base, tenders: cash(30000) }, 'actor'),
    );

    expect(payments.create.mock.calls[0]![1].allocations).toEqual([
      { purchaseInvoiceId: 'i1', amount: 30000 },
    ]);
  });

  it('counts a debit note towards what the payment can settle', async () => {
    const payments = repo();
    const handler = new CreateSupplierPaymentHandler(payments);

    await handler.execute(
      new CreateSupplierPaymentCommand(
        {
          ...base,
          tenders: cash(25000),
          debitNotes: [{ purchaseReturnId: 'r1', amount: 5000 }],
        },
        'actor',
      ),
    );

    const [, data] = payments.create.mock.calls[0]!;
    expect(data.amount).toBe(25000);
    expect(data.adjustedAmount).toBe(5000);
    // 25,000 cash plus 5,000 of credit clears the 30,000 bill exactly.
    expect(data.allocations).toEqual([{ purchaseInvoiceId: 'i1', amount: 30000 }]);
  });

  it('allows a payment that is purely a debit-note set-off, with no cash', async () => {
    const payments = repo();
    const handler = new CreateSupplierPaymentHandler(payments);

    await handler.execute(
      new CreateSupplierPaymentCommand(
        { ...base, tenders: [], debitNotes: [{ purchaseReturnId: 'r1', amount: 5000 }] },
        'actor',
      ),
    );

    const [, data] = payments.create.mock.calls[0]!;
    expect(data.amount).toBe(0);
    expect(data.adjustedAmount).toBe(5000);
    expect(data.allocations).toEqual([{ purchaseInvoiceId: 'i1', amount: 5000 }]);
  });

  it('rejects a payment that moves neither money nor credit', async () => {
    const handler = new CreateSupplierPaymentHandler(repo());
    await expect(
      handler.execute(new CreateSupplierPaymentCommand({ ...base, tenders: [] }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses to spend more credit than a debit note has left', async () => {
    const handler = new CreateSupplierPaymentHandler(repo());
    await expect(
      handler.execute(
        new CreateSupplierPaymentCommand(
          { ...base, tenders: [], debitNotes: [{ purchaseReturnId: 'r1', amount: 9000 }] },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a debit note belonging to someone else', async () => {
    const handler = new CreateSupplierPaymentHandler(repo());
    await expect(
      handler.execute(
        new CreateSupplierPaymentCommand(
          { ...base, tenders: [], debitNotes: [{ purchaseReturnId: 'r9', amount: 100 }] },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses to settle more than a bill has outstanding', async () => {
    const handler = new CreateSupplierPaymentHandler(repo());
    await expect(
      handler.execute(
        new CreateSupplierPaymentCommand(
          {
            ...base,
            tenders: cash(50000),
            allocations: [{ purchaseInvoiceId: 'i1', amount: 40000 }],
          },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses allocations adding up to more than the payment is worth', async () => {
    const handler = new CreateSupplierPaymentHandler(repo());
    await expect(
      handler.execute(
        new CreateSupplierPaymentCommand(
          {
            ...base,
            tenders: cash(1000),
            allocations: [
              { purchaseInvoiceId: 'i1', amount: 30000 },
              { purchaseInvoiceId: 'i2', amount: 20000 },
            ],
          },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects the same bill listed twice', async () => {
    const handler = new CreateSupplierPaymentHandler(repo());
    await expect(
      handler.execute(
        new CreateSupplierPaymentCommand(
          {
            ...base,
            tenders: cash(30000),
            allocations: [
              { purchaseInvoiceId: 'i1', amount: 15000 },
              { purchaseInvoiceId: 'i1', amount: 15000 },
            ],
          },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('leaves an overpayment on account rather than forcing it onto a bill', async () => {
    const payments = repo();
    const handler = new CreateSupplierPaymentHandler(payments);

    await handler.execute(
      new CreateSupplierPaymentCommand({ ...base, tenders: cash(60000) }, 'actor'),
    );

    const [, data] = payments.create.mock.calls[0]!;
    expect(data.amount).toBe(60000);
    expect(data.allocatedAmount).toBe(50000);
  });
});

describe('UpdateSupplierPaymentHandler', () => {
  it('will not edit a posted payment', async () => {
    const payments = repo();
    payments.findById.mockResolvedValue({
      id: 'p1',
      status: 'POSTED',
    } as SupplierPaymentItem);
    const handler = new UpdateSupplierPaymentHandler(payments);

    await expect(
      handler.execute(new UpdateSupplierPaymentCommand('p1', { version: 1 }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(payments.update).not.toHaveBeenCalled();
  });

  it('keeps the existing tenders when the edit does not mention them', async () => {
    const payments = repo();
    payments.findById.mockResolvedValue({
      id: 'p1',
      status: 'DRAFT',
      supplierId: 's1',
      branchId: 'b1',
      paymentDate: '2026-08-01T00:00:00.000Z',
      tenders: [
        { id: 't1', mode: 'CASH', amount: 30000, referenceNo: null, bankName: null },
      ],
      allocations: [],
      debitNotes: [],
    } as unknown as SupplierPaymentItem);
    const handler = new UpdateSupplierPaymentHandler(payments);

    await handler.execute(
      new UpdateSupplierPaymentCommand('p1', { version: 1, remarks: 'Cheque handed over' }, 'actor'),
    );

    expect(payments.update.mock.calls[0]![2].amount).toBe(30000);
  });
});
