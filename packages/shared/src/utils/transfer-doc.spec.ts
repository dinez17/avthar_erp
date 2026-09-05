import {
  EWAY_BILL_THRESHOLD,
  isOpenTransfer,
  needsEwayBill,
  shortQty,
  transferDocumentType,
  transferTotals,
  valueTransferLine,
} from './transfer-doc';

describe('transferDocumentType', () => {
  it('is a challan when both branches share one GSTIN', () => {
    expect(transferDocumentType('33AABCT1234C1Z5', '33AABCT1234C1Z5')).toBe('DELIVERY_CHALLAN');
  });

  it('is a tax invoice when the branches are registered separately', () => {
    expect(transferDocumentType('33AABCT1234C1Z5', '29AABCT1234C1ZB')).toBe('TAX_INVOICE');
  });

  it('ignores case and stray spaces, which a pasted GSTIN often carries', () => {
    expect(transferDocumentType(' 33aabct1234c1z5 ', '33AABCT1234C1Z5')).toBe('DELIVERY_CHALLAN');
  });

  it('falls back to a challan when either branch has no GSTIN', () => {
    expect(transferDocumentType('33AABCT1234C1Z5', null)).toBe('DELIVERY_CHALLAN');
    expect(transferDocumentType(null, '33AABCT1234C1Z5')).toBe('DELIVERY_CHALLAN');
    expect(transferDocumentType('   ', '33AABCT1234C1Z5')).toBe('DELIVERY_CHALLAN');
  });
});

describe('valueTransferLine', () => {
  it('values a taxable line at rate times quantity, plus tax', () => {
    expect(valueTransferLine({ qtyBoxes: 10, rate: 450, gstRate: 18 }, true)).toEqual({
      lineSubTotal: 4500,
      lineGst: 810,
      lineTotal: 5310,
    });
  });

  it('states a value but charges nothing on a challan', () => {
    expect(valueTransferLine({ qtyBoxes: 10, rate: 450, gstRate: 18 }, false)).toEqual({
      lineSubTotal: 4500,
      lineGst: 0,
      lineTotal: 4500,
    });
  });

  it('handles a part box, which loose pieces produce', () => {
    expect(valueTransferLine({ qtyBoxes: 2.5, rate: 300, gstRate: 18 }, true).lineSubTotal).toBe(
      750,
    );
  });

  it('is zero for a zero rate rather than undefined', () => {
    expect(valueTransferLine({ qtyBoxes: 10, rate: 0, gstRate: 18 }, true)).toEqual({
      lineSubTotal: 0,
      lineGst: 0,
      lineTotal: 0,
    });
  });
});

describe('transferTotals', () => {
  const lines = [
    { lineSubTotal: 4500, lineGst: 810, lineTotal: 5310 },
    { lineSubTotal: 2000, lineGst: 360, lineTotal: 2360 },
  ];

  it('halves the tax into CGST and SGST within one state', () => {
    expect(transferTotals(lines, false)).toEqual({
      subTotal: 6500,
      cgstAmount: 585,
      sgstAmount: 585,
      igstAmount: 0,
      gstAmount: 1170,
      grandTotal: 7670,
    });
  });

  it('puts the whole tax in IGST across a state line', () => {
    expect(transferTotals(lines, true)).toEqual({
      subTotal: 6500,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 1170,
      gstAmount: 1170,
      grandTotal: 7670,
    });
  });

  it('keeps the heads adding back to the tax when halving leaves a paisa', () => {
    const odd = transferTotals([{ lineSubTotal: 100, lineGst: 5.01, lineTotal: 105.01 }], false);
    expect(odd.cgstAmount + odd.sgstAmount).toBeCloseTo(odd.gstAmount, 2);
  });

  it('is all zeros for a challan, whose lines carry no tax', () => {
    const challan = transferTotals([{ lineSubTotal: 4500, lineGst: 0, lineTotal: 4500 }], false);
    expect(challan).toEqual({
      subTotal: 4500,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      gstAmount: 0,
      grandTotal: 4500,
    });
  });
});

describe('needsEwayBill', () => {
  it('is not needed at or below the threshold', () => {
    expect(needsEwayBill(EWAY_BILL_THRESHOLD)).toBe(false);
    expect(needsEwayBill(49_999.99)).toBe(false);
  });

  it('is needed a rupee above it', () => {
    expect(needsEwayBill(50_001)).toBe(true);
  });
});

describe('shortQty', () => {
  it('is what did not arrive', () => {
    expect(shortQty(100, 98)).toBe(2);
  });

  it('is zero on a full delivery', () => {
    expect(shortQty(100, 100)).toBe(0);
  });

  it('will not go negative when the far end counts more than was sent', () => {
    expect(shortQty(100, 105)).toBe(0);
  });
});

describe('isOpenTransfer', () => {
  it('is open only while the goods are on the lorry', () => {
    expect(isOpenTransfer('IN_TRANSIT')).toBe(true);
    expect(isOpenTransfer('RECEIVED')).toBe(false);
    expect(isOpenTransfer('CANCELLED')).toBe(false);
  });
});
