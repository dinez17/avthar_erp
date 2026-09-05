import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type { CreateGatePassInput } from '@tiles-erp/shared-types';
import type { GatePassSource } from '../domain/gate-pass-source';
import { buildGatePassData } from './gate-pass.handlers';

const BRANCH = '11111111-1111-4111-8111-111111111111';
const OTHER_BRANCH = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '33333333-3333-4333-8333-333333333333';
const OTHER_CUSTOMER = '44444444-4444-4444-8444-444444444444';
const PRODUCT = '55555555-5555-4555-8555-555555555555';
const GODOWN = '66666666-6666-4666-8666-666666666666';
const INVOICE = '77777777-7777-4777-8777-777777777777';
const VEHICLE = '88888888-8888-4888-8888-888888888888';
const DRIVER = '99999999-9999-4999-8999-999999999999';
const TRANSPORTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const SECOND_INVOICE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRANSFER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** The two invoices the fixtures know about, one per customer. */
const INVOICES = {
  [INVOICE]: {
    id: INVOICE,
    invoiceNumber: 'INV-2026-00001',
    invoiceDate: new Date('2026-08-01'),
    customerId: CUSTOMER,
    customerName: 'Karthik Traders',
    customerAddress: '12 Bazaar Street, Salem',
    branchId: BRANCH,
    grandTotal: 118000,
    freightCharge: 3000,
  },
  [SECOND_INVOICE]: {
    id: SECOND_INVOICE,
    invoiceNumber: 'INV-2026-00002',
    invoiceDate: new Date('2026-08-02'),
    customerId: OTHER_CUSTOMER,
    customerName: 'Murugan Tiles',
    customerAddress: '4 Mount Road, Erode',
    branchId: BRANCH,
    grandTotal: 47200,
    freightCharge: 1200,
  },
};

/** A source with everything present and consistent; each test bends one part of it. */
function sourceOf(overrides: Partial<GatePassSource> = {}): GatePassSource {
  return {
    invoiceForDispatch: async (id) => INVOICES[id as keyof typeof INVOICES] ?? null,
    transferForDispatch: async () => null,
    productForLine: async (id) =>
      id === PRODUCT ? { id: PRODUCT, sku: 'KAJ-VIT-600-BLK', piecesPerBox: 4 } : null,
    vehicle: async () => ({ id: VEHICLE, number: 'TN01AB1234', transporterId: TRANSPORTER }),
    driver: async () => ({ id: DRIVER, name: 'Murugan', phone: '9876500000', transporterId: null }),
    transporter: async () => ({ id: TRANSPORTER, name: 'Sri Lorry Service' }),
    ...overrides,
  };
}

const salesPass = (overrides: Partial<CreateGatePassInput> = {}): CreateGatePassInput => ({
  type: 'SALES',
  branchId: BRANCH,
  documents: [{ key: 'inv-1', salesInvoiceId: INVOICE }],
  lines: [
    { documentKey: 'inv-1', productId: PRODUCT, godownId: GODOWN, docQtyBoxes: 20, boxes: 18 },
  ],
  ...overrides,
});

/** One lorry, two customers — the ordinary delivery round. */
const roundPass = (): CreateGatePassInput => ({
  type: 'SALES',
  branchId: BRANCH,
  documents: [
    { key: 'inv-1', salesInvoiceId: INVOICE },
    { key: 'inv-2', salesInvoiceId: SECOND_INVOICE },
  ],
  lines: [
    { documentKey: 'inv-1', productId: PRODUCT, godownId: GODOWN, docQtyBoxes: 20, boxes: 20 },
    { documentKey: 'inv-2', productId: PRODUCT, godownId: GODOWN, docQtyBoxes: 8, boxes: 8 },
  ],
});

describe('buildGatePassData', () => {
  it('copies the invoice number, date, value and customer onto the pass', async () => {
    const data = await buildGatePassData(sourceOf(), salesPass());

    expect(data.documents).toHaveLength(1);
    expect(data.documents[0]).toMatchObject({
      salesInvoiceId: INVOICE,
      documentNumber: 'INV-2026-00001',
      documentValue: 118000,
      customerId: CUSTOMER,
      customerName: 'Karthik Traders',
      deliveryAddress: '12 Bazaar Street, Salem',
    });
  });

  it('sums the customer freight from the invoices aboard', async () => {
    const data = await buildGatePassData(sourceOf(), salesPass());
    expect(data.billedFreight).toBe(3000);
  });

  describe('a delivery round', () => {
    it('carries invoices for several customers on one pass', async () => {
      const data = await buildGatePassData(sourceOf(), roundPass());

      expect(data.documents.map((document) => document.customerName)).toEqual([
        'Karthik Traders',
        'Murugan Tiles',
      ]);
    });

    it('leaves the header customer empty rather than naming only the first drop', async () => {
      const data = await buildGatePassData(sourceOf(), roundPass());
      expect(data.customerId).toBeNull();
    });

    it('names the header customer when the whole load is for one of them', async () => {
      const data = await buildGatePassData(sourceOf(), salesPass());
      expect(data.customerId).toBe(CUSTOMER);
    });

    it('numbers the drops in the order they were added', async () => {
      const data = await buildGatePassData(sourceOf(), roundPass());
      expect(data.documents.map((document) => document.sequence)).toEqual([1, 2]);
    });

    it('honours a drop order given explicitly', async () => {
      const round = roundPass();
      const data = await buildGatePassData(sourceOf(), {
        ...round,
        documents: [
          { ...round.documents![0]!, sequence: 2 },
          { ...round.documents![1]!, sequence: 1 },
        ],
      });
      expect(data.documents.map((document) => document.sequence)).toEqual([2, 1]);
    });

    it('adds up the freight billed across every customer aboard', async () => {
      const data = await buildGatePassData(sourceOf(), roundPass());
      expect(data.billedFreight).toBe(4200);
    });

    it('charges each drop what its invoice billed unless told otherwise', async () => {
      const data = await buildGatePassData(sourceOf(), roundPass());
      expect(data.documents.map((document) => document.freightCharge)).toEqual([3000, 1200]);
      expect(data.documents.map((document) => document.billedFreight)).toEqual([3000, 1200]);
    });

    it('takes a freight charge agreed per customer', async () => {
      const round = roundPass();
      const data = await buildGatePassData(sourceOf(), {
        ...round,
        documents: [
          { ...round.documents![0]!, freightCharge: 4000 },
          { ...round.documents![1]!, freightCharge: 0 },
        ],
      });

      expect(data.documents[0]).toMatchObject({ freightCharge: 4000, billedFreight: 3000 });
      // Free delivery for the second drop, though the invoice had billed for it.
      expect(data.documents[1]).toMatchObject({ freightCharge: 0, billedFreight: 1200 });
    });

    it('takes a per-drop address over the one on the customer master', async () => {
      const round = roundPass();
      const data = await buildGatePassData(sourceOf(), {
        ...round,
        documents: [
          { ...round.documents![0]!, deliveryAddress: 'Site: Plot 9, Hosur' },
          round.documents![1]!,
        ],
      });
      expect(data.documents[0]!.deliveryAddress).toBe('Site: Plot 9, Hosur');
      expect(data.documents[1]!.deliveryAddress).toBe('4 Mount Road, Erode');
    });
  });

  it('turns loose pieces into a fraction of a box', async () => {
    const data = await buildGatePassData(
      sourceOf(),
      salesPass({
        lines: [
          { documentKey: 'inv-1', productId: PRODUCT, godownId: GODOWN, docQtyBoxes: 20, boxes: 18, pieces: 3 },
        ],
      }),
    );
    // 4 pieces to a box, so 18 box 3 pcs is 18.75.
    expect(data.lines[0]!.qtyBoxes).toBe(18.75);
  });

  it('refuses to load more than the invoice says', async () => {
    await expect(
      buildGatePassData(
        sourceOf(),
        salesPass({
          lines: [
            { documentKey: 'inv-1', productId: PRODUCT, godownId: GODOWN, docQtyBoxes: 20, boxes: 21 },
          ],
        }),
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('accepts a short load — the lorry filled up', async () => {
    const data = await buildGatePassData(
      sourceOf(),
      salesPass({
        lines: [
          { documentKey: 'inv-1', productId: PRODUCT, godownId: GODOWN, docQtyBoxes: 20, boxes: 12 },
        ],
      }),
    );
    expect(data.lines[0]!.qtyBoxes).toBe(12);
  });

  it('refuses an invoice from another branch', async () => {
    const source = sourceOf({
      invoiceForDispatch: async () => ({ ...INVOICES[INVOICE], branchId: OTHER_BRANCH }),
    });
    await expect(buildGatePassData(source, salesPass())).rejects.toThrow(/another branch/);
  });

  it('refuses an invoice that is not posted', async () => {
    const source = sourceOf({ invoiceForDispatch: async () => null });
    await expect(buildGatePassData(source, salesPass())).rejects.toThrow(NotFoundError);
  });

  it('refuses a sales pass with no invoice on it', async () => {
    await expect(
      buildGatePassData(sourceOf(), salesPass({ documents: [] })),
    ).rejects.toThrow(/at least one invoice/);
  });

  it('refuses a line pointing at a document that is not aboard', async () => {
    await expect(
      buildGatePassData(
        sourceOf(),
        salesPass({
          lines: [{ documentKey: 'inv-9', productId: PRODUCT, godownId: GODOWN, boxes: 5 }],
        }),
      ),
    ).rejects.toThrow(/not on this pass/);
  });

  it('refuses an invoiced line that says which document it is not', async () => {
    await expect(
      buildGatePassData(
        sourceOf(),
        salesPass({ lines: [{ productId: PRODUCT, godownId: GODOWN, boxes: 5 }] }),
      ),
    ).rejects.toThrow(/which document/);
  });

  it('drops a line with nothing loaded on it', async () => {
    await expect(
      buildGatePassData(
        sourceOf(),
        salesPass({
          lines: [{ documentKey: 'inv-1', productId: PRODUCT, godownId: GODOWN, boxes: 0 }],
        }),
      ),
    ).rejects.toThrow(/Nothing has been loaded/);
  });

  it('copies the vehicle, driver and transporter from the masters', async () => {
    const data = await buildGatePassData(
      sourceOf(),
      salesPass({ vehicleId: VEHICLE, driverId: DRIVER }),
    );

    expect(data.vehicleNumber).toBe('TN01AB1234');
    expect(data.driverName).toBe('Murugan');
    expect(data.driverPhone).toBe('9876500000');
    expect(data.transporterId).toBe(TRANSPORTER);
    expect(data.transporterName).toBe('Sri Lorry Service');
  });

  it('lets the master win over a number typed alongside it', async () => {
    const data = await buildGatePassData(
      sourceOf(),
      salesPass({ vehicleId: VEHICLE, vehicleNumber: 'TN59XY9999' }),
    );
    expect(data.vehicleNumber).toBe('TN01AB1234');
  });

  it('keeps a typed lorry number for a vehicle that is not in the master', async () => {
    const data = await buildGatePassData(
      sourceOf(),
      salesPass({ vehicleNumber: 'TN59XY9999', driverName: 'Unknown driver' }),
    );

    expect(data.vehicleId).toBeNull();
    expect(data.vehicleNumber).toBe('TN59XY9999');
    expect(data.driverName).toBe('Unknown driver');
  });

  it('refuses a vehicle that has been removed from the master', async () => {
    const source = sourceOf({ vehicle: async () => null });
    await expect(
      buildGatePassData(source, salesPass({ vehicleId: VEHICLE })),
    ).rejects.toThrow(NotFoundError);
  });

  it('takes the transporter from the driver when the lorry has none', async () => {
    const source = sourceOf({
      vehicle: async () => ({ id: VEHICLE, number: 'TN01AB1234', transporterId: null }),
      driver: async () => ({
        id: DRIVER,
        name: 'Murugan',
        phone: '9876500000',
        transporterId: TRANSPORTER,
      }),
    });
    const data = await buildGatePassData(
      source,
      salesPass({ vehicleId: VEHICLE, driverId: DRIVER }),
    );
    expect(data.transporterId).toBe(TRANSPORTER);
  });

  it('refuses an advance larger than the hire charge', async () => {
    await expect(
      buildGatePassData(sourceOf(), salesPass({ hireCharge: 2000, advancePaid: 2500 })),
    ).rejects.toThrow(/more than the hire charge/);
  });

  describe('a transfer pass', () => {
    const transferSource = sourceOf({
      transferForDispatch: async () => ({
        id: TRANSFER_ID,
        transferNo: 'TR-2026-0004',
        transferDate: new Date('2026-08-02'),
      }),
    });

    const transferPass: CreateGatePassInput = {
      type: 'TRANSFER',
      branchId: BRANCH,
      toBranchId: OTHER_BRANCH,
      documents: [{ key: 't-1', stockTransferId: TRANSFER_ID }],
      lines: [{ documentKey: 't-1', productId: PRODUCT, godownId: GODOWN, boxes: 10 }],
    };

    it('goes to a branch, not a customer', async () => {
      const data = await buildGatePassData(transferSource, transferPass);
      expect(data.toBranchId).toBe(OTHER_BRANCH);
      expect(data.customerId).toBeNull();
    });

    it('refuses one with no destination branch', async () => {
      await expect(
        buildGatePassData(transferSource, { ...transferPass, toBranchId: undefined }),
      ).rejects.toThrow(/branch the goods are going to/);
    });

    it('is never returnable', async () => {
      const data = await buildGatePassData(transferSource, { ...transferPass, returnable: true });
      expect(data.returnable).toBe(false);
    });
  });

  describe('a sample pass', () => {
    const samplePass: CreateGatePassInput = {
      type: 'SAMPLE',
      branchId: BRANCH,
      customerId: CUSTOMER,
      lines: [{ productId: PRODUCT, godownId: GODOWN, boxes: 1 }],
    };

    it('needs no document at all', async () => {
      const data = await buildGatePassData(sourceOf(), samplePass);
      expect(data.documents).toHaveLength(0);
      expect(data.lines[0]!.documentKey).toBeNull();
    });

    it('is returnable unless said otherwise', async () => {
      expect((await buildGatePassData(sourceOf(), samplePass)).returnable).toBe(true);
      expect(
        (await buildGatePassData(sourceOf(), { ...samplePass, returnable: false })).returnable,
      ).toBe(false);
    });

    it('still needs a customer to go to', async () => {
      await expect(
        buildGatePassData(sourceOf(), { ...samplePass, customerId: undefined }),
      ).rejects.toThrow(/customer/);
    });
  });
});
