import {
  buildSixOrbitPushPlan,
  CARRIED_FORWARD,
  SIXORBIT_MEASUREMENT,
  sqftPerPiece,
  type SixOrbitPushInput,
} from './sixorbit-push';

const input = (over: Partial<SixOrbitPushInput> = {}): SixOrbitPushInput => ({
  sixorbitId: null,
  name: 'AV ROVEN GREY E 4X2 (3) (GLITTER)',
  sku: '17361',
  hsnCode: '69072100',
  gstRate: 18,
  sellingRate: 635.59,
  purchaseRate: 109,
  mrp: null,
  piecesPerBox: 3,
  sqftPerBox: 24,
  barcode: null,
  isActive: true,
  brandSixorbitId: '410012486',
  categorySixorbitId: '410053695',
  attributes: [{ aid: '410000891', attr_name: 'SIZE', avid: '410540575', attr_value: '4X2' }],
  raw: null,
  ...over,
});

describe('sqftPerPiece', () => {
  it('converts our per-box area to their per-piece field', () => {
    // The most damaging mistake available in this file: they multiply `measurements` by
    // `package_qty`, so sending a box figure inflates every quantity threefold.
    expect(sqftPerPiece(24, 3)).toBe(8);
  });

  it('is zero rather than Infinity when the pieces per box is zero', () => {
    expect(sqftPerPiece(24, 0)).toBe(0);
  });
});

describe('buildSixOrbitPushPlan — create', () => {
  it('creates when they have never seen the product', () => {
    const plan = buildSixOrbitPushPlan(input());
    expect(plan.operation).toBe('create');
    expect(plan.blocks).toEqual([]);
    expect(plan.payload.isvid).toBeUndefined();
  });

  it('maps into their write field names, which differ from their read names', () => {
    const plan = buildSixOrbitPushPlan(input());
    expect(plan.payload).toMatchObject({
      item_name: 'AV ROVEN GREY E 4X2 (3) (GLITTER)',
      hsn: '69072100',
      item_tax: '18',
      price: '635.59',
      package_qty: '3',
      measurements: '8',
      unit: SIXORBIT_MEASUREMENT.PIECES,
      measurement_unit: SIXORBIT_MEASUREMENT.SQFT,
      brand: '410012486',
      categories: [{ id: '410053695' }],
    });
  });

  it('sends attributes as the id pairs their API wants, not our labels', () => {
    const plan = buildSixOrbitPushPlan(input());
    expect(plan.payload.attributes).toEqual([{ aid: '410000891', avid: '410540575' }]);
  });
});

describe('buildSixOrbitPushPlan — edit', () => {
  /** A read payload, which is what `sixorbitRaw` actually holds after an import. */
  const raw = {
    isvid: '160595',
    variation_number: '17361',
    variation_name: 'AV ROVEN GREY E 4X2 (3) (GLITTER) — their older name',
    // Read-shape names. None of these is a field their write form accepts.
    hsn_code: '69072100',
    tax: '18.00000000',
    package_quantity: '3',
    measured_qty: '8.0000',
    category_id: '410053695',
    price_with_tax: '750.00000000',
    limit: '7682',
    // Write-shape names, genuinely theirs to keep.
    default_vendor: '410038615',
    weight: '15.00000000',
    price: '600.00000000',
  };

  it('edits when they already have it', () => {
    const plan = buildSixOrbitPushPlan(input({ sixorbitId: '160595', raw }));
    expect(plan.operation).toBe('edit');
    expect(plan.payload.isvid).toBe('160595');
  });

  it('keeps their write-form fields that we do not model', () => {
    // Sending only our dozen fields would wipe their vendor mapping and their weight.
    const plan = buildSixOrbitPushPlan(input({ sixorbitId: '160595', raw }));
    expect(plan.payload.default_vendor).toBe('410038615');
    expect(plan.payload.weight).toBe('15.00000000');
  });

  it('overwrites the fields we do own', () => {
    const plan = buildSixOrbitPushPlan(input({ sixorbitId: '160595', raw }));
    expect(plan.payload.price).toBe('635.59');
  });

  it('sends no read-shape field their write form has never heard of', () => {
    // This is the bug that produced "11475: Please Provide valid item name". Spreading the
    // whole read payload posted ninety unrecognised keys — including a stale
    // `variation_name` — at a form that accepts thirty-five, and their validator rejected
    // the lot. None of them was ever readable by that endpoint, so none is worth sending.
    const plan = buildSixOrbitPushPlan(input({ sixorbitId: '160595', raw }));
    for (const stale of [
      'variation_name',
      'variation_number',
      'hsn_code',
      'tax',
      'package_quantity',
      'measured_qty',
      'category_id',
      'price_with_tax',
      'limit',
    ]) {
      expect(plan.payload).not.toHaveProperty(stale);
    }
  });

  it('sends no field a create would not, beyond isvid and the carried-forward list', () => {
    // Their documented edit request is their create request plus `isvid`. Anything an edit
    // sends outside that — or outside the fields we deliberately preserve — is a key
    // nobody has evidence their form accepts.
    const create = buildSixOrbitPushPlan(input());
    const edit = buildSixOrbitPushPlan(input({ sixorbitId: '160595', raw }));

    const allowed = new Set<string>([...Object.keys(create.payload), ...CARRIED_FORWARD, 'isvid']);
    expect(Object.keys(edit.payload).filter((k) => !allowed.has(k))).toEqual([]);
  });

  it('carries the name we hold, not the one they last sent us', () => {
    const plan = buildSixOrbitPushPlan(
      input({ sixorbitId: '160595', raw, name: '2X2 CERAMICS TILES BOX (2X2)' }),
    );
    expect(plan.payload.item_name).toBe('2X2 CERAMICS TILES BOX (2X2)');
  });
});

describe('buildSixOrbitPushPlan — blocks', () => {
  it('blocks a product whose brand they do not have', () => {
    // Their API has no add-brand task, so this can never succeed by retrying.
    const plan = buildSixOrbitPushPlan(input({ brandSixorbitId: null }));
    expect(plan.blocks).toContain('BRAND_NOT_IN_SIXORBIT');
  });

  it('blocks a product whose category they do not have', () => {
    const plan = buildSixOrbitPushPlan(input({ categorySixorbitId: null }));
    expect(plan.blocks).toContain('CATEGORY_NOT_IN_SIXORBIT');
  });

  it('blocks a product with no selling price or no geometry', () => {
    expect(buildSixOrbitPushPlan(input({ sellingRate: null })).blocks).toContain(
      'NO_SELLING_PRICE',
    );
    expect(buildSixOrbitPushPlan(input({ piecesPerBox: 0 })).blocks).toContain('NO_GEOMETRY');
    expect(buildSixOrbitPushPlan(input({ sqftPerBox: 0 })).blocks).toContain('NO_GEOMETRY');
  });

  it('reports every block, not just the first', () => {
    // The worklist is worth more when one visit fixes everything wrong with a row.
    const plan = buildSixOrbitPushPlan(
      input({ brandSixorbitId: null, categorySixorbitId: null, sellingRate: null }),
    );
    expect(plan.blocks).toHaveLength(3);
  });

  it('still builds the payload so a blocked product can be inspected', () => {
    const plan = buildSixOrbitPushPlan(input({ brandSixorbitId: null }));
    expect(plan.payload.item_name).toBe('AV ROVEN GREY E 4X2 (3) (GLITTER)');
  });
});
