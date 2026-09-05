import {
  expectedSqftForSize,
  mapSixOrbitVariation,
  parseSixOrbitTimestamp,
  sizeFromAttributes,
  totalFromVariationPage,
  type SixOrbitVariation,
} from './sixorbit-variation';

/**
 * Both fixtures are real rows from `task=variation/fetch` against the Avthar tenant,
 * trimmed to the fields the mapper reads. Real data rather than invented data on purpose:
 * the whole risk in this mapper is that their catalogue does not behave the way a tidy
 * example would, and one of these two rows already does not.
 */
const MARMORIES: SixOrbitVariation = {
  isvid: '160596',
  status_id: '1',
  variation_number: '17362',
  variation_name: 'SIM MARMORIES CREAM (FT) 1600X800',
  sku: '',
  hsn_code: '69072100',
  unit: 'PCS',
  brand: 'SIMPOLO',
  brand_id: '410012324',
  category_id: '410053961',
  category: 'SIMPOLO-FLOORING-1600X800',
  tax: '18.00000000',
  price: '1533.90000000',
  price_with_tax: '1534.080000000000',
  purchase_price: '16.00000000',
  package_quantity: '2',
  c_package_measurement: 'Box',
  measured_qty: '14.2000',
  measured_unit: 'SQFT',
  barcode: '',
  mrp: '0.00000000',
  updated_time: '2026-08-20 16:34:35',
  attributes: [{ aid: '410000891', attr_name: 'SIZE', avid: '410540588', attr_value: '1600X800' }],
  limit: '7682',
};

const ROVEN: SixOrbitVariation = {
  isvid: '160595',
  status_id: '1',
  variation_number: '17361',
  variation_name: 'AV ROVEN GREY E 4X2 (3) (GLITTER)',
  sku: '',
  hsn_code: '69072100',
  unit: 'PCS',
  brand: 'UDAY (AVTHAR)',
  brand_id: '410012486',
  category_id: '410053695',
  category: 'TILES',
  tax: '18.00000000',
  price: '635.59000000',
  purchase_price: '109.00000000',
  package_quantity: '3',
  c_package_measurement: 'Box',
  measured_qty: '8.0000',
  measured_unit: 'SQFT',
  barcode: '',
  rack_code: 'NULL',
  mrp: '0.00000000',
  updated_time: '2026-08-20 15:33:51',
  attributes: [{ aid: '410000891', attr_name: 'SIZE', avid: '410540575', attr_value: '4X2' }],
  limit: '7682',
} as SixOrbitVariation;

describe('geometry', () => {
  it('reads measured_qty as the area of one piece, not one box', () => {
    // The decisive row: a 4ft x 2ft tile is exactly 8 sq.ft, and measured_qty is 8.0000.
    // Were it per box it would have to be 2.67, which matches no tile of that name.
    const mapped = mapSixOrbitVariation(ROVEN);
    expect(mapped.piecesPerBox).toBe(3);
    expect(mapped.sqftPerBox).toBeCloseTo(24, 4);
  });

  it('multiplies pieces by area for the box figure', () => {
    const mapped = mapSixOrbitVariation(MARMORIES);
    expect(mapped.piecesPerBox).toBe(2);
    expect(mapped.sqftPerBox).toBeCloseTo(28.4, 4);
  });

  it('flags a row whose area disagrees with its own SIZE', () => {
    // 1600mm x 800mm is 13.78 sq.ft; SixOrbit says 14.2, a 3% overstatement. Since sq.ft
    // drives the price, that is 3% on every sale of this tile.
    expect(mapSixOrbitVariation(MARMORIES).warnings).toContain('AREA_DISAGREES_WITH_SIZE');
  });

  it('does not flag a row that agrees with itself', () => {
    expect(mapSixOrbitVariation(ROVEN).warnings).not.toContain('AREA_DISAGREES_WITH_SIZE');
  });

  it('flags a row with no geometry at all rather than importing it as sellable', () => {
    const mapped = mapSixOrbitVariation({ ...ROVEN, package_quantity: '0', measured_qty: '' });
    expect(mapped.warnings).toContain('MISSING_GEOMETRY');
    expect(mapped.sqftPerBox).toBe(0);
  });
});

describe('expectedSqftForSize', () => {
  it('reads a large pair as millimetres', () => {
    expect(expectedSqftForSize('1600X800')).toBeCloseTo(13.78, 2);
  });

  it('reads a small pair as feet', () => {
    // Nothing in the payload says which unit a SIZE is in; magnitude is the only signal.
    expect(expectedSqftForSize('4X2')).toBe(8);
  });

  it('returns null for anything it cannot read, rather than guessing', () => {
    expect(expectedSqftForSize('600x600x10')).toBeNull();
    expect(expectedSqftForSize('LARGE')).toBeNull();
    expect(expectedSqftForSize(null)).toBeNull();
  });
});

describe('money', () => {
  it('takes purchase_price as the landing cost', () => {
    // Not price_with_tax: that is the selling price grossed up, and booking it as cost
    // would put 18% GST into COGS and understate every margin.
    expect(mapSixOrbitVariation(ROVEN).landingCost).toBe(109);
    expect(mapSixOrbitVariation(ROVEN).sellingRate).toBe(635.59);
  });

  it('flags a cost that is implausibly low against the price', () => {
    // 16.00 against a price of 1533.90 is 1%. Left unflagged, the below-cost guard would
    // never fire for this product.
    expect(mapSixOrbitVariation(MARMORIES).warnings).toContain('COST_IMPLAUSIBLY_LOW');
  });

  it('flags a cost at or above the price', () => {
    const mapped = mapSixOrbitVariation({ ...ROVEN, purchase_price: '700.00' });
    expect(mapped.warnings).toContain('COST_NOT_BELOW_PRICE');
  });

  it('flags a missing price', () => {
    expect(mapSixOrbitVariation({ ...ROVEN, price: '0.00' }).warnings).toContain('MISSING_PRICE');
  });

  it('carries the tax rate even though the company reports tax disabled', () => {
    expect(mapSixOrbitVariation(ROVEN).gstRate).toBe(18);
  });
});

describe('identity and masters', () => {
  it('uses variation_number for the SKU, since their sku is always empty', () => {
    expect(mapSixOrbitVariation(ROVEN).sku).toBe('17361');
  });

  it('falls back to isvid only when there is no variation number either', () => {
    const mapped = mapSixOrbitVariation({ ...ROVEN, variation_number: '', sku: '' });
    expect(mapped.sku).toBe('160595');
  });

  it('keeps every id as a string', () => {
    const mapped = mapSixOrbitVariation(ROVEN);
    expect(mapped.sixorbitId).toBe('160595');
    expect(mapped.brand?.sixorbitId).toBe('410012486');
    expect(mapped.category?.sixorbitId).toBe('410053695');
  });

  it('takes the size verbatim from the SIZE attribute', () => {
    expect(mapSixOrbitVariation(ROVEN).sizeMm).toBe('4X2');
    expect(sizeFromAttributes(MARMORIES.attributes)).toBe('1600X800');
  });

  it('treats the literal string NULL as absent', () => {
    // Their exports write N-U-L-L into text columns rather than a JSON null.
    expect(mapSixOrbitVariation({ ...ROVEN, barcode: 'NULL' }).barcode).toBeNull();
  });

  it('maps status_id 1 to active and anything else to inactive', () => {
    expect(mapSixOrbitVariation(ROVEN).isActive).toBe(true);
    expect(mapSixOrbitVariation({ ...ROVEN, status_id: '2' }).isActive).toBe(false);
  });
});

describe('timestamps', () => {
  it('reads their space-separated format', () => {
    expect(parseSixOrbitTimestamp('2026-08-20 15:33:51')?.getFullYear()).toBe(2026);
  });

  it('treats their zero date as absent', () => {
    expect(parseSixOrbitTimestamp('0000-00-00 00:00:00')).toBeNull();
    expect(parseSixOrbitTimestamp('')).toBeNull();
  });
});

describe('paging', () => {
  it('reads the total from the per-row limit field', () => {
    // They repeat the total on every row instead of putting it in a header.
    expect(totalFromVariationPage({ variations: [MARMORIES, ROVEN] })).toBe(7682);
  });

  it('returns null for an empty page', () => {
    expect(totalFromVariationPage({ variations: [] })).toBeNull();
  });
});

describe('their "0" sentinel for an absent relation', () => {
  it('treats brand_id "0" as no brand rather than a brand called "0"', () => {
    // Real rows carry "0" in parent_category_id, franchiser_isvid, e_commerce_id and
    // appltid. "0" is truthy in JS, so this is the difference between skipping an
    // unbranded product and inventing a junk master every such product hangs off.
    const mapped = mapSixOrbitVariation({
      isvid: '1',
      variation_name: 'No brand',
      variation_number: '900',
      brand_id: '0',
      brand: '',
      category_id: '410053695',
      category: 'TILES',
    });
    expect(mapped.brand).toBeNull();
    expect(mapped.category).not.toBeNull();
  });

  it('treats category_id "0" as no category', () => {
    const mapped = mapSixOrbitVariation({
      isvid: '2',
      variation_name: 'No category',
      variation_number: '901',
      brand_id: '410012324',
      brand: 'SIMPOLO',
      category_id: '0',
    });
    expect(mapped.category).toBeNull();
    expect(mapped.brand?.name).toBe('SIMPOLO');
  });

  it('still maps a real relation, and falls back to the id when the name is blank', () => {
    const mapped = mapSixOrbitVariation({
      isvid: '3',
      variation_name: 'Named by id',
      variation_number: '902',
      brand_id: '410012486',
      brand: '   ',
      category_id: '410053961',
      category: 'SIMPOLO-FLOORING-1600X800',
    });
    expect(mapped.brand).toEqual({ sixorbitId: '410012486', name: '410012486' });
    expect(mapped.category?.name).toBe('SIMPOLO-FLOORING-1600X800');
  });
});
